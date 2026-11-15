(() => {
  "use strict";
  const $ = (selector, root=document) => root.querySelector(selector);
  const state = { token: "", categories: [], products: [], page: 0, pageSize: 20, search: "", category: "", showArchived: false };
  const money = value => Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const tokenKey = "bar-amigos-admin-session-v5";

  function setStatus(message, isError=false) {
    const box = $("#dashboard-view").hidden ? $("#auth-status") : $("#admin-status");
    box.textContent = message;
    box.classList.toggle("error", isError);
    box.hidden = !message;
  }

  function showView(view) {
    $("#login-view").hidden = view !== "login";
    $("#password-view").hidden = view !== "password";
    $("#dashboard-view").hidden = view !== "dashboard";
    $("#logout-button").hidden = view === "login";
    $("#change-password-open").hidden = view !== "dashboard";
    if (view !== "dashboard") setStatus("");
  }

  function setToken(token) {
    state.token = token || "";
    if (state.token) sessionStorage.setItem(tokenKey, state.token);
    else sessionStorage.removeItem(tokenKey);
  }

  function categoryName(id) { return state.categories.find(category => category.id === id)?.nome || id || "Sem categoria"; }

  function updateSummary() {
    const active = state.products.filter(product => product.ativo);
    $("#active-count").textContent = String(active.length);
    $("#unavailable-count").textContent = String(active.filter(product => !product.disponivel).length);
    $("#category-count").textContent = String(state.categories.filter(category => category.ativa).length);
  }

  function refreshCategoryOptions() {
    const filter = $("#category-filter");
    const current = filter.value;
    filter.replaceChildren(new Option("Todas", ""));
    state.categories.forEach(category => filter.add(new Option(category.nome + (category.ativa ? "" : " (inativa)"), category.id)));
    if (state.categories.some(category => category.id === current)) filter.value = current;

    const productCategory = $("#product-form").elements.namedItem("categoria");
    const selected = productCategory.value;
    productCategory.replaceChildren(new Option("Escolha uma categoria", ""));
    state.categories.forEach(category => productCategory.add(new Option(category.nome + (category.ativa ? "" : " (inativa)"), category.id)));
    if (state.categories.some(category => category.id === selected)) productCategory.value = selected;
  }

  function renderProducts() {
    const list = $("#product-list");
    list.replaceChildren();
    const query = state.search.toLocaleLowerCase("pt-BR");
    const filtered = state.products.filter(product => {
      const visible = state.showArchived || product.ativo;
      const categoryMatches = !state.category || product.categoria === state.category;
      const text = [product.nome, product.tamanho, product.subcategoria, product.grupo].join(" ").toLocaleLowerCase("pt-BR");
      return visible && categoryMatches && text.includes(query);
    }).sort((a, b) => categoryName(a.categoria).localeCompare(categoryName(b.categoria), "pt-BR") || a.nome.localeCompare(b.nome, "pt-BR") || String(a.tamanho).localeCompare(String(b.tamanho), "pt-BR"));
    const pageCount = Math.max(1, Math.ceil(filtered.length / state.pageSize));
    state.page = Math.min(state.page, pageCount - 1);
    const pageItems = filtered.slice(state.page * state.pageSize, (state.page + 1) * state.pageSize);
    if (!pageItems.length) {
      const empty = document.createElement("p");
      empty.className = "empty-admin";
      empty.textContent = filtered.length ? "Não há produtos nesta página." : "Nenhum produto encontrado. Ajuste a busca ou adicione um produto.";
      list.append(empty);
    }
    pageItems.forEach(product => list.append(createProductCard(product)));
    const pagination = $("#pagination");
    pagination.hidden = filtered.length <= state.pageSize;
    $("#page-label").textContent = `Página ${state.page + 1} de ${pageCount} · ${filtered.length} produtos`;
    $("#previous-page").disabled = state.page === 0;
    $("#next-page").disabled = state.page >= pageCount - 1;
    updateSummary();
  }

  function createProductCard(product) {
    const card = document.createElement("article");
    card.className = "admin-product-card" + (product.ativo ? "" : " archived");
    const title = document.createElement("div");
    title.className = "admin-product-title";
    const name = document.createElement("h2");
    name.textContent = product.grupo || product.nome;
    const detail = document.createElement("p");
    const details = [categoryName(product.categoria), product.nome !== product.grupo ? product.nome : "", product.tamanho, product.subcategoria].filter(Boolean);
    detail.textContent = details.join(" · ");
    title.append(name, detail);

    const price = document.createElement("div");
    price.className = "admin-product-price";
    price.textContent = product.precoIndefinido ? "Consultar" : money(product.preco);
    const priceNote = document.createElement("small");
    priceNote.textContent = product.precoIndefinido ? "Sem preço cadastrado" : "Preço do cardápio";
    price.append(priceNote);

    const meta = document.createElement("div");
    meta.className = "admin-product-meta";
    const status = document.createElement("span");
    status.className = "admin-pill " + (product.disponivel ? "available" : "unavailable");
    status.textContent = product.disponivel ? "Disponível" : "Indisponível";
    meta.append(status);
    if (!product.ativo) {
      const archived = document.createElement("span");
      archived.className = "admin-pill archived-label";
      archived.textContent = "Arquivado";
      meta.append(archived);
    }
    if (product.retornavel) {
      const returnable = document.createElement("span");
      returnable.className = "admin-pill";
      returnable.textContent = "Retornável";
      meta.append(returnable);
    }

    const actions = document.createElement("div");
    actions.className = "admin-product-actions";
    actions.append(actionButton("edit", "Editar produto", "button button-outline", product.id));
    actions.append(actionButton("availability", product.disponivel ? "Marcar em falta" : "Marcar disponível", "button button-outline", product.id));
    actions.append(actionButton("archive", product.ativo ? "Arquivar" : "Restaurar", "button button-outline", product.id));
    card.append(title, price, meta, actions);
    return card;
  }

  function actionButton(action, label, className, id) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.dataset.action = action;
    button.dataset.id = id;
    button.textContent = label;
    return button;
  }

  async function loadAdminData() {
    const data = await window.BarBridge.call("adminData", state.token);
    state.categories = data.categorias || [];
    state.products = data.produtos || [];
    refreshCategoryOptions();
    renderProducts();
    renderCategoriesEditor();
  }

  async function handleLogin(event) {
    event.preventDefault();
    const password = $("#login-password").value;
    const button = event.submitter;
    button.disabled = true;
    try {
      const result = await window.BarBridge.call("login", password);
      setToken(result.token);
      $("#login-password").value = "";
      if (result.mustChangePassword) showView("password");
      else { await loadAdminData(); showView("dashboard"); setStatus("Acesso liberado."); }
    } catch (error) { setStatus(error.message, true); }
    finally { button.disabled = false; }
  }

  async function changePassword(currentPassword, newPassword) {
    if (newPassword.length < 12) throw new Error("A nova senha precisa ter pelo menos 12 caracteres.");
    await window.BarBridge.call("changePassword", state.token, currentPassword, newPassword);
  }

  async function handleFirstPassword(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const current = form.elements.namedItem("currentPassword").value;
    const next = form.elements.namedItem("newPassword").value;
    const confirm = form.elements.namedItem("confirmPassword").value;
    if (next !== confirm) { setStatus("As novas senhas não coincidem.", true); return; }
    const button = event.submitter;
    button.disabled = true;
    try {
      await changePassword(current, next);
      form.reset();
      await loadAdminData();
      showView("dashboard");
      setStatus("Senha atualizada. O painel está pronto para uso.");
    } catch (error) { setStatus(error.message, true); }
    finally { button.disabled = false; }
  }

  function openProduct(product) {
    const form = $("#product-form");
    form.reset();
    refreshCategoryOptions();
    form.elements.namedItem("id").value = product?.id || "";
    form.elements.namedItem("nome").value = product?.nome || "";
    form.elements.namedItem("categoria").value = product?.categoria || "";
    form.elements.namedItem("subcategoria").value = product?.subcategoria || "";
    form.elements.namedItem("tamanho").value = product?.tamanho || "";
    form.elements.namedItem("grupo").value = product?.grupo || "";
    form.elements.namedItem("preco").value = product?.precoIndefinido ? "" : (product?.preco ?? "");
    form.elements.namedItem("ilustracao").value = product?.ilustracao || "assets/ilustracoes/drink.svg";
    form.elements.namedItem("descricao").value = product?.descricao || "";
    form.elements.namedItem("ingredientes").value = product?.ingredientes || "";
    form.elements.namedItem("precoIndefinido").checked = Boolean(product?.precoIndefinido);
    form.elements.namedItem("disponivel").checked = product ? Boolean(product.disponivel) : true;
    form.elements.namedItem("ativo").checked = product ? Boolean(product.ativo) : true;
    form.elements.namedItem("retornavel").checked = Boolean(product?.retornavel);
    form.elements.namedItem("preco").disabled = Boolean(product?.precoIndefinido);
    form.elements.namedItem("preco").required = !product?.precoIndefinido;
    $("#product-dialog-title").textContent = product ? "Editar produto" : "Novo produto";
    $("#product-dialog").showModal();
  }

  async function saveProduct(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const element = name => form.elements.namedItem(name);
    const product = {
      id: element("id").value,
      nome: element("nome").value,
      categoria: element("categoria").value,
      subcategoria: element("subcategoria").value,
      tamanho: element("tamanho").value,
      grupo: element("grupo").value,
      preco: element("precoIndefinido").checked ? 0 : Number(element("preco").value || 0),
      precoIndefinido: element("precoIndefinido").checked,
      ilustracao: element("ilustracao").value,
      descricao: element("descricao").value,
      ingredientes: element("ingredientes").value,
      disponivel: element("disponivel").checked,
      ativo: element("ativo").checked,
      retornavel: element("retornavel").checked,
      origem: "Atualizado pelo painel administrativo."
    };
    const button = event.submitter;
    button.disabled = true;
    try {
      await window.BarBridge.call("saveProduct", state.token, product);
      $("#product-dialog").close();
      await loadAdminData();
      setStatus("Produto salvo no Google Sheets.");
    } catch (error) { setStatus(error.message, true); }
    finally { button.disabled = false; }
  }

  async function changeProduct(product, update, successMessage) {
    try {
      await window.BarBridge.call("saveProduct", state.token, { ...product, ...update });
      await loadAdminData();
      setStatus(successMessage);
    } catch (error) { setStatus(error.message, true); }
  }

  async function handleProductAction(event) {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const product = state.products.find(item => item.id === button.dataset.id);
    if (!product) return;
    if (button.dataset.action === "edit") { openProduct(product); return; }
    button.disabled = true;
    if (button.dataset.action === "availability") {
      await changeProduct(product, { disponivel: !product.disponivel }, product.disponivel ? "Produto marcado como indisponível." : "Produto marcado como disponível.");
    } else if (button.dataset.action === "archive") {
      await changeProduct(product, { ativo: !product.ativo }, product.ativo ? "Produto arquivado; ele continua disponível para restauração." : "Produto restaurado no catálogo.");
    }
    button.disabled = false;
  }

  function renderCategoriesEditor() {
    const list = $("#category-editor-list");
    list.replaceChildren();
    state.categories.forEach(category => {
      const card = document.createElement("div");
      card.className = "category-editor-card";
      card.dataset.id = category.id;
      const nameLabel = document.createElement("label");
      nameLabel.textContent = "Nome";
      const name = document.createElement("input");
      name.value = category.nome;
      name.maxLength = 60;
      nameLabel.append(name);
      const orderLabel = document.createElement("label");
      orderLabel.textContent = "Ordem";
      const order = document.createElement("input");
      order.type = "number";
      order.min = "1";
      order.max = "999";
      order.value = String(category.ordem);
      orderLabel.append(order);
      const activeLabel = document.createElement("label");
      activeLabel.className = "category-enabled";
      const active = document.createElement("input");
      active.type = "checkbox";
      active.checked = category.ativa;
      activeLabel.append(active, document.createTextNode("Exibir"));
      const actions = document.createElement("div");
      actions.className = "category-editor-actions";
      actions.append(actionButton("save-category", "Salvar categoria", "button button-outline", category.id));
      actions.append(actionButton("delete-category", "Excluir categoria", "button button-outline", category.id));
      card.append(nameLabel, orderLabel, activeLabel, actions);
      list.append(card);
    });
  }

  async function handleCategoryAction(event) {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const card = button.closest(".category-editor-card");
    const id = button.dataset.id;
    if (button.dataset.action === "save-category") {
      const inputs = card.querySelectorAll("input");
      const category = { id, nome: inputs[0].value, ordem: Number(inputs[1].value), ativa: inputs[2].checked };
      button.disabled = true;
      try {
        await window.BarBridge.call("saveCategory", state.token, category);
        await loadAdminData();
        setStatus("Categoria atualizada.");
      } catch (error) { setStatus(error.message, true); }
      finally { button.disabled = false; }
    }
    if (button.dataset.action === "delete-category") {
      const category = state.categories.find(item => item.id === id);
      if (!window.confirm(`Excluir a categoria “${category?.nome || ""}”?`)) return;
      button.disabled = true;
      try {
        await window.BarBridge.call("deleteCategory", state.token, id);
        await loadAdminData();
        setStatus("Categoria excluída.");
      } catch (error) { setStatus(error.message, true); }
      finally { button.disabled = false; }
    }
  }

  async function addCategory(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = event.submitter;
    button.disabled = true;
    try {
      await window.BarBridge.call("saveCategory", state.token, { nome: form.elements.namedItem("nome").value, ordem: Number(form.elements.namedItem("ordem").value), ativa: true });
      form.reset();
      form.elements.namedItem("ordem").value = String(state.categories.length + 1);
      await loadAdminData();
      setStatus("Categoria criada.");
    } catch (error) { setStatus(error.message, true); }
    finally { button.disabled = false; }
  }

  async function changeCurrentPassword(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const current = form.elements.namedItem("currentPassword").value;
    const next = form.elements.namedItem("newPassword").value;
    if (next !== form.elements.namedItem("confirmPassword").value) { setStatus("As novas senhas não coincidem.", true); return; }
    const button = event.submitter;
    button.disabled = true;
    try {
      await changePassword(current, next);
      form.reset();
      $("#change-password-dialog").close();
      setStatus("Senha atualizada com segurança.");
    } catch (error) { setStatus(error.message, true); }
    finally { button.disabled = false; }
  }

  async function logout() {
    const token = state.token;
    setToken("");
    showView("login");
    try { if (token) await window.BarBridge.call("logout", token); } catch (_) {}
  }

  function bindEvents() {
    $("#login-form").addEventListener("submit", handleLogin);
    $("#first-password-form").addEventListener("submit", handleFirstPassword);
    $("#product-form").addEventListener("submit", saveProduct);
    $("#product-list").addEventListener("click", handleProductAction);
    $("#category-editor-list").addEventListener("click", handleCategoryAction);
    $("#category-add-form").addEventListener("submit", addCategory);
    $("#change-password-form").addEventListener("submit", changeCurrentPassword);
    $("#logout-button").addEventListener("click", logout);
    $("#product-add").addEventListener("click", () => openProduct(null));
    $("#categories-open").addEventListener("click", () => $("#categories-dialog").showModal());
    $("#change-password-open").addEventListener("click", () => $("#change-password-dialog").showModal());
    $("#product-search").addEventListener("input", event => { state.search = event.target.value.trim(); state.page = 0; renderProducts(); });
    $("#category-filter").addEventListener("change", event => { state.category = event.target.value; state.page = 0; renderProducts(); });
    $("#show-archived").addEventListener("change", event => { state.showArchived = event.target.checked; state.page = 0; renderProducts(); });
    $("#previous-page").addEventListener("click", () => { state.page = Math.max(0, state.page - 1); renderProducts(); });
    $("#next-page").addEventListener("click", () => { state.page++; renderProducts(); });
    $("#product-form").elements.namedItem("precoIndefinido").addEventListener("change", event => {
      const price = $("#product-form").elements.namedItem("preco");
      price.disabled = event.target.checked;
      price.required = !event.target.checked;
      if (event.target.checked) price.value = "";
    });
    document.querySelectorAll("[data-close]").forEach(button => button.addEventListener("click", () => $("#" + button.dataset.close).close()));
    document.querySelectorAll(".admin-dialog").forEach(dialog => dialog.addEventListener("click", event => { if (event.target === dialog) dialog.close(); }));
  }

  async function init() {
    bindEvents();
    if (!window.BarBridge?.available()) {
      $("#setup-warning").hidden = false;
      $("#login-form button[type=submit]").disabled = true;
      return;
    }
    const savedToken = sessionStorage.getItem(tokenKey);
    if (!savedToken) return;
    setToken(savedToken);
    try {
      await loadAdminData();
      showView("dashboard");
    } catch (_) { setToken(""); }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
