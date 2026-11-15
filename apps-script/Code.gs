const V5_ALLOWED_ORIGINS = ["https://SEU-USUARIO.github.io"];
const SHEET_HEADERS = {
  Produtos: ["id", "categoria", "subcategoria", "nome", "descricao", "ingredientes", "tamanho", "preco", "precoIndefinido", "ilustracao", "origem", "disponivel", "ativo", "retornavel", "embalagem", "grupo"],
  Categorias: ["id", "nome", "ordem", "ativa"],
  Configuracoes: ["chave", "valor"],
  Historico: ["data", "acao", "item"]
};
const SESSION_LIFETIME_SECONDS = 21600;
const PASSWORD_MIN_LENGTH = 12;

function doGet() {
  const template = HtmlService.createTemplateFromFile("Bridge");
  template.allowedOrigins = JSON.stringify(getAllowedOrigins_());
  return template.evaluate()
    .setTitle("Conexão segura — Bar dos Amigos")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function setupV5() {
  const origins = V5_ALLOWED_ORIGINS.filter(origin => /^https:\/\//.test(origin) && !origin.includes("SEU-USUARIO"));
  if (!origins.length) throw new Error("Edite V5_ALLOWED_ORIGINS no Code.gs com a origem do GitHub Pages antes de configurar.");
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) throw new Error("Abra ou crie a planilha e execute o Apps Script vinculado a ela.");
  const properties = PropertiesService.getScriptProperties();
  properties.setProperties({
    SPREADSHEET_ID: spreadsheet.getId(),
    ALLOWED_ORIGINS: JSON.stringify(origins)
  }, false);
  ensureHeaders_(spreadsheet, "Produtos", SHEET_HEADERS.Produtos);
  ensureHeaders_(spreadsheet, "Categorias", SHEET_HEADERS.Categorias);
  ensureHeaders_(spreadsheet, "Configuracoes", SHEET_HEADERS.Configuracoes);
  ensureHeaders_(spreadsheet, "Historico", SHEET_HEADERS.Historico);

  const productSheet = spreadsheet.getSheetByName("Produtos");
  const categorySheet = spreadsheet.getSheetByName("Categorias");
  const settingsSheet = spreadsheet.getSheetByName("Configuracoes");
  if (productSheet.getLastRow() <= 1) {
    const rows = CATALOGO_V44.produtos.map(productToRow_);
    if (rows.length) productSheet.getRange(2, 1, rows.length, SHEET_HEADERS.Produtos.length).setValues(rows);
  }
  if (categorySheet.getLastRow() <= 1) {
    const rows = CATALOGO_V44.categorias.map(categoryToRow_);
    if (rows.length) categorySheet.getRange(2, 1, rows.length, SHEET_HEADERS.Categorias.length).setValues(rows);
  }
  const existingSettings = readKeyValues_(settingsSheet);
  Object.keys(CATALOGO_V44.sobre || {}).forEach(key => {
    if (!(key in existingSettings)) settingsSheet.appendRow([key, String(CATALOGO_V44.sobre[key])]);
  });
  let initialPassword = "";
  if (!properties.getProperty("ADMIN_PASSWORD_HASH")) {
    const ui = SpreadsheetApp.getUi();
    const response = ui.prompt("Senha provisória", "Digite a senha provisória para o primeiro acesso ao painel.", ui.ButtonSet.OK_CANCEL);
    if (response.getSelectedButton() !== ui.Button.OK || !response.getResponseText()) throw new Error("Configuração cancelada. Execute setupV5() novamente quando estiver pronto.");
    initialPassword = response.getResponseText();
  }
  initializeAuthentication_(properties, initialPassword);
  return "Configuração pronta. Catálogo V4.4 preservado e senha provisória configurada para a primeira entrada.";
}

function initializeAuthentication_(properties, initialPassword) {
  if (!properties.getProperty("AUTH_PEPPER")) properties.setProperty("AUTH_PEPPER", Utilities.getUuid() + Utilities.getUuid());
  if (!properties.getProperty("AUTH_VERSION")) properties.setProperty("AUTH_VERSION", "1");
  if (!properties.getProperty("ADMIN_PASSWORD_HASH")) {
    const salt = Utilities.getUuid();
    properties.setProperties({
      ADMIN_PASSWORD_SALT: salt,
      ADMIN_PASSWORD_HASH: passwordHash_(String(initialPassword || ""), salt),
      PASSWORD_CHANGE_REQUIRED: "true"
    });
  }
}

function apiPublicMenu() {
  const data = readCatalog_();
  const categories = data.categorias.filter(category => category.ativa);
  const visibleCategoryIds = new Set(categories.map(category => category.id));
  return {
    categorias,
    produtos: data.produtos.filter(product => product.ativo && visibleCategoryIds.has(product.categoria)),
    sobre: data.sobre
  };
}

function apiLogin(password) {
  const properties = PropertiesService.getScriptProperties();
  assertConfigured_();
  assertNotLocked_(properties);
  const salt = properties.getProperty("ADMIN_PASSWORD_SALT") || "";
  const expected = properties.getProperty("ADMIN_PASSWORD_HASH") || "";
  const actual = passwordHash_(String(password || ""), salt);
  if (!expected || !constantTimeEqual_(actual, expected)) {
    registerFailedLogin_(properties);
    throw new Error("Senha incorreta ou acesso temporariamente bloqueado.");
  }
  clearFailedLogins_(properties);
  const token = Utilities.getUuid() + Utilities.getUuid();
  const mustChangePassword = properties.getProperty("PASSWORD_CHANGE_REQUIRED") === "true";
  const version = Number(properties.getProperty("AUTH_VERSION") || 1);
  CacheService.getScriptCache().put(sessionKey_(token), JSON.stringify({ mustChangePassword, version }), SESSION_LIFETIME_SECONDS);
  return { token, mustChangePassword };
}

function apiChangePassword(token, currentPassword, newPassword) {
  const session = requireSession_(token, true);
  const properties = PropertiesService.getScriptProperties();
  assertNotLocked_(properties);
  const salt = properties.getProperty("ADMIN_PASSWORD_SALT") || "";
  const expected = properties.getProperty("ADMIN_PASSWORD_HASH") || "";
  const actual = passwordHash_(String(currentPassword || ""), salt);
  if (!constantTimeEqual_(actual, expected)) {
    registerFailedLogin_(properties);
    throw new Error("A senha atual não confere.");
  }
  const password = String(newPassword || "");
  if (password.length < PASSWORD_MIN_LENGTH) throw new Error("Escolha uma senha com pelo menos 12 caracteres.");
  if (password === String(currentPassword || "")) throw new Error("A nova senha precisa ser diferente da provisória.");
  const newSalt = Utilities.getUuid();
  const version = Number(properties.getProperty("AUTH_VERSION") || 1) + 1;
  properties.setProperties({
    ADMIN_PASSWORD_SALT: newSalt,
    ADMIN_PASSWORD_HASH: passwordHash_(password, newSalt),
    PASSWORD_CHANGE_REQUIRED: "false",
    AUTH_VERSION: String(version)
  });
  clearFailedLogins_(properties);
  session.mustChangePassword = false;
  session.version = version;
  CacheService.getScriptCache().put(sessionKey_(token), JSON.stringify(session), SESSION_LIFETIME_SECONDS);
  return { ok: true };
}

function apiAdminData(token) {
  requireSession_(token);
  return readCatalog_();
}

function apiSaveProduct(token, input) {
  requireSession_(token);
  const product = normalizeProduct_(input || {});
  const catalog = readCatalog_();
  if (!catalog.categorias.some(category => category.id === product.categoria)) throw new Error("Escolha uma categoria existente.");
  const sheet = getSheet_("Produtos");
  const existingRow = findRowById_(sheet, product.id);
  const row = productToRow_(product);
  if (existingRow) sheet.getRange(existingRow, 1, 1, row.length).setValues([row]);
  else sheet.appendRow(row);
  logChange_(existingRow ? "Produto atualizado" : "Produto criado", product.nome);
  return { product, saved: true };
}

function apiSaveCategory(token, input) {
  requireSession_(token);
  const category = normalizeCategory_(input || {});
  const sheet = getSheet_("Categorias");
  const categories = readRows_(sheet, SHEET_HEADERS.Categorias).map(row => rowToCategory_(row));
  if (categories.some(item => item.id !== category.id && item.nome.toLocaleLowerCase("pt-BR") === category.nome.toLocaleLowerCase("pt-BR"))) {
    throw new Error("Já existe uma categoria com esse nome.");
  }
  const row = categoryToRow_(category);
  const existingRow = findRowById_(sheet, category.id);
  if (existingRow) sheet.getRange(existingRow, 1, 1, row.length).setValues([row]);
  else sheet.appendRow(row);
  logChange_(existingRow ? "Categoria atualizada" : "Categoria criada", category.nome);
  return { category, saved: true };
}

function apiDeleteCategory(token, categoryId) {
  requireSession_(token);
  const products = readCatalog_().produtos;
  if (products.some(product => product.categoria === String(categoryId))) {
    throw new Error("Essa categoria ainda tem produtos. Mova os produtos para outra categoria antes de excluí-la.");
  }
  const sheet = getSheet_("Categorias");
  const row = findRowById_(sheet, String(categoryId));
  if (!row) throw new Error("Categoria não encontrada.");
  const name = sheet.getRange(row, 2).getDisplayValue();
  sheet.deleteRow(row);
  logChange_("Categoria excluída", name);
  return { deleted: true };
}

function apiLogout(token) {
  if (token) CacheService.getScriptCache().remove(sessionKey_(token));
  return { ok: true };
}

function readCatalog_() {
  assertConfigured_();
  const categories = readRows_(getSheet_("Categorias"), SHEET_HEADERS.Categorias).map(rowToCategory_);
  const products = readRows_(getSheet_("Produtos"), SHEET_HEADERS.Produtos).map(rowToProduct_);
  const about = readKeyValues_(getSheet_("Configuracoes"));
  categories.sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, "pt-BR"));
  return { categorias: categories, produtos: products, sobre: about };
}

function normalizeProduct_(input) {
  const id = cleanText_(input.id, 60) || "P" + Utilities.getUuid().replace(/-/g, "").slice(0, 12).toUpperCase();
  const name = cleanText_(input.nome, 100);
  const category = cleanText_(input.categoria, 60);
  if (!name) throw new Error("Informe o nome do produto.");
  if (!category) throw new Error("Escolha uma categoria.");
  const undefinedPrice = input.precoIndefinido === true || input.precoIndefinido === "true";
  const rawPrice = String(input.preco === undefined ? "0" : input.preco).trim().replace(",", ".");
  const price = Number(rawPrice);
  if (!undefinedPrice && rawPrice === "") throw new Error("Informe o preço ou marque “Consultar preço no balcão”.");
  if (!undefinedPrice && (!Number.isFinite(price) || price < 0 || price > 99999)) throw new Error("Informe um preço válido.");
  return {
    id,
    categoria: category,
    subcategoria: cleanText_(input.subcategoria, 80),
    nome: name,
    descricao: cleanText_(input.descricao, 300),
    ingredientes: cleanText_(input.ingredientes, 300),
    tamanho: cleanText_(input.tamanho, 80),
    preco: undefinedPrice ? 0 : Math.round(price * 100) / 100,
    precoIndefinido: undefinedPrice,
    ilustracao: cleanText_(input.ilustracao, 200) || "assets/ilustracoes/drink.svg",
    origem: cleanText_(input.origem, 250) || "Atualizado pelo painel administrativo.",
    disponivel: input.disponivel === true || input.disponivel === "true",
    ativo: input.ativo !== false && input.ativo !== "false",
    retornavel: input.retornavel === true || input.retornavel === "true",
    embalagem: cleanText_(input.embalagem, 80),
    grupo: cleanText_(input.grupo, 100)
  };
}

function normalizeCategory_(input) {
  const name = cleanText_(input.nome, 60);
  if (!name) throw new Error("Informe o nome da categoria.");
  const existingId = cleanText_(input.id, 60);
  const id = existingId || "cat-" + Utilities.getUuid().replace(/-/g, "").slice(0, 10).toLowerCase();
  if (!/^[a-zA-Z0-9_-]{1,60}$/.test(id)) throw new Error("Identificador de categoria inválido.");
  const order = Number(input.ordem || 1);
  if (!Number.isInteger(order) || order < 1 || order > 999) throw new Error("A ordem deve ser um número inteiro positivo.");
  return { id, nome: name, ordem: order, ativa: input.ativa !== false && input.ativa !== "false" };
}

function productToRow_(product) {
  return [product.id, product.categoria, product.subcategoria || "", product.nome, product.descricao || "", product.ingredientes || "", product.tamanho || "", Number(product.preco || 0), Boolean(product.precoIndefinido), product.ilustracao || "", product.origem || "", Boolean(product.disponivel), product.ativo !== false, Boolean(product.retornavel), product.embalagem || "", product.grupo || ""];
}

function categoryToRow_(category) { return [category.id, category.nome, Number(category.ordem || 1), category.ativa !== false]; }

function rowToProduct_(row) {
  return {
    id: String(row.id || ""), categoria: String(row.categoria || ""), subcategoria: String(row.subcategoria || ""),
    nome: String(row.nome || ""), descricao: String(row.descricao || ""), ingredientes: String(row.ingredientes || ""),
    tamanho: String(row.tamanho || ""), preco: Number(row.preco || 0), precoIndefinido: asBoolean_(row.precoIndefinido),
    ilustracao: String(row.ilustracao || ""), origem: String(row.origem || ""), disponivel: asBoolean_(row.disponivel),
    ativo: row.ativo === "" ? true : asBoolean_(row.ativo), retornavel: asBoolean_(row.retornavel),
    embalagem: String(row.embalagem || ""), grupo: String(row.grupo || "")
  };
}

function rowToCategory_(row) {
  return { id: String(row.id || ""), nome: String(row.nome || ""), ordem: Number(row.ordem || 0), ativa: asBoolean_(row.ativa) };
}

function readRows_(sheet, headers) {
  if (!sheet || sheet.getLastRow() < 2) return [];
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues();
  return values.filter(row => row.some(value => value !== "")).map(row => {
    const record = {};
    headers.forEach((header, index) => { record[header] = row[index]; });
    return record;
  });
}

function readKeyValues_(sheet) {
  if (!sheet || sheet.getLastRow() < 2) return {};
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues().reduce((values, row) => {
    if (row[0]) values[String(row[0])] = String(row[1] || "");
    return values;
  }, {});
}

function ensureHeaders_(spreadsheet, name, headers) {
  let sheet = spreadsheet.getSheetByName(name);
  if (!sheet) sheet = spreadsheet.insertSheet(name);
  if (sheet.getLastRow() === 0) sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);
  return sheet;
}

function getSheet_(name) {
  const id = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
  if (!id) throw new Error("Execute setupV5() no editor do Apps Script primeiro.");
  const sheet = SpreadsheetApp.openById(id).getSheetByName(name);
  if (!sheet) throw new Error("A aba " + name + " não foi encontrada. Execute setupV5().");
  return sheet;
}

function findRowById_(sheet, id) {
  if (!id || sheet.getLastRow() < 2) return 0;
  const match = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).createTextFinder(id).matchEntireCell(true).findNext();
  return match ? match.getRow() : 0;
}

function assertConfigured_() {
  const properties = PropertiesService.getScriptProperties();
  if (!properties.getProperty("SPREADSHEET_ID") || !properties.getProperty("ADMIN_PASSWORD_HASH")) {
    throw new Error("O painel ainda não foi configurado. Execute setupV5() no Apps Script.");
  }
}

function requireSession_(token, allowPasswordChange) {
  assertConfigured_();
  if (!token || String(token).length < 30) throw new Error("Sua sessão expirou. Entre novamente.");
  const record = CacheService.getScriptCache().get(sessionKey_(String(token)));
  if (!record) throw new Error("Sua sessão expirou. Entre novamente.");
  const session = JSON.parse(record);
  const currentVersion = Number(PropertiesService.getScriptProperties().getProperty("AUTH_VERSION") || 1);
  if (Number(session.version || 0) !== currentVersion) throw new Error("Sua sessão foi encerrada por uma troca de senha. Entre novamente.");
  if (session.mustChangePassword && !allowPasswordChange) throw new Error("Troque a senha provisória antes de continuar.");
  return session;
}

function getAllowedOrigins_() {
  const raw = PropertiesService.getScriptProperties().getProperty("ALLOWED_ORIGINS") || "[]";
  let origins = [];
  try { origins = JSON.parse(raw); } catch (_) {}
  return origins.filter(origin => /^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(origin));
}

function sessionKey_(token) { return "session:" + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, token)); }

function passwordHash_(password, salt) {
  const pepper = PropertiesService.getScriptProperties().getProperty("AUTH_PEPPER") || "";
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(String(salt) + ":" + String(password), pepper, Utilities.Charset.UTF_8));
}

function constantTimeEqual_(left, right) {
  left = String(left); right = String(right);
  let diff = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i++) diff |= (left.charCodeAt(i) || 0) ^ (right.charCodeAt(i) || 0);
  return diff === 0;
}

function assertNotLocked_(properties) {
  const lockUntil = Number(properties.getProperty("LOGIN_LOCK_UNTIL") || 0);
  if (Date.now() < lockUntil) throw new Error("Muitas tentativas. Tente novamente em 15 minutos.");
}

function registerFailedLogin_(properties) {
  const lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    const now = Date.now();
    let started = Number(properties.getProperty("LOGIN_WINDOW_START") || 0);
    let attempts = Number(properties.getProperty("LOGIN_FAILURES") || 0);
    if (!started || now - started > 15 * 60 * 1000) { started = now; attempts = 0; }
    attempts++;
    properties.setProperties({ LOGIN_WINDOW_START: String(started), LOGIN_FAILURES: String(attempts) });
    if (attempts >= 5) properties.setProperty("LOGIN_LOCK_UNTIL", String(now + 15 * 60 * 1000));
  } finally { lock.releaseLock(); }
}

function clearFailedLogins_(properties) {
  properties.deleteProperty("LOGIN_WINDOW_START");
  properties.deleteProperty("LOGIN_FAILURES");
  properties.deleteProperty("LOGIN_LOCK_UNTIL");
}

function cleanText_(value, maxLength) { return String(value == null ? "" : value).replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, maxLength); }
function asBoolean_(value) { return value === true || String(value).toLocaleLowerCase() === "true" || String(value) === "1"; }

function logChange_(action, item) {
  const sheet = getSheet_("Historico");
  sheet.appendRow([new Date(), action, cleanText_(item, 100)]);
}
