(() => {
  "use strict";
  const $ = (selector, root=document) => root.querySelector(selector);
  const state = { token: "", categories: [], products: [], page: 0, pageSize: 12, search: "", category: "", showArchived: false, editingProducts: [], commonInitial: {}, initialFormSnapshot: "", bodyScrollY: 0, saving: false, quickBill: [], adminSection: "summary" };
  const money = value => Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const tokenKey = "bar-amigos-admin-session-v5";
  const PRESENTATION_TYPES = {
    cervejas: ["Lata", "Garrafa", "Long neck", "Chope", "Personalizado"],
    refrigerantes: ["Lata", "Garrafa", "Copo", "Personalizado"],
    aguas: ["Garrafa", "Lata", "Copo", "Personalizado"],
    energeticos: ["Lata", "Garrafa", "Personalizado"],
    destilados: ["Dose", "Garrafa", "Personalizado"],
    drinks: ["Copo", "Dose", "Personalizado"],
    salgados: ["Unidade", "Porção", "Personalizado"],
    porcoes: ["Porção", "Unidade", "Personalizado"],
    snacks: ["Pacote", "Unidade", "Personalizado"]
  };
  const PRESENTATION_SIZES = {
    cervejas: ["269 ml", "300 ml", "330 ml", "350 ml", "473 ml", "600 ml", "1 litro"],
    refrigerantes: ["200 ml", "269 ml", "350 ml", "600 ml", "1 litro", "1,5 litro", "2 litros"],
    aguas: ["200 ml", "300 ml", "350 ml", "500 ml", "600 ml", "1 litro", "1,5 litro", "2 litros"],
    energeticos: ["250 ml", "269 ml", "473 ml", "1 litro"],
    destilados: ["30 ml", "45 ml", "50 ml", "60 ml", "700 ml", "750 ml", "1 litro"],
    drinks: ["300 ml", "400 ml", "500 ml", "Dose"],
    salgados: ["Pequena", "Média", "Grande", "Unidade"],
    porcoes: ["Pequena", "Média", "Grande", "Individual", "Para compartilhar"],
    snacks: ["Unidade", "30–37 g", "40 g", "48 g", "60 g", "68 g", "85 g", "115 g", "150 g"]
  };
  const DEFAULT_TYPES = ["Unidade", "Porção", "Lata", "Garrafa", "Copo", "Personalizado"];
  const DEFAULT_SIZES = ["Pequena", "Média", "Grande", "Unidade"];

  function normalizeKey(value) { return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("pt-BR"); }
  function familyProducts(product) {
    if (!product) return [];
    const family = normalizeKey(product.grupo || product.nome);
    return state.products.filter(item => item.categoria === product.categoria && normalizeKey(item.grupo || item.nome) === family);
  }

  function selectOptions(select, values, placeholder, selected, includeCustom=false, includeNone=false) {
    select.replaceChildren(new Option(placeholder, ""));
    if (includeNone) select.add(new Option("Sem tamanho indicado", "__none"));
    values.filter(value => !includeCustom || value !== "Personalizado").forEach(value => select.add(new Option(value, value)));
    if (includeCustom) select.add(new Option("Personalizado", "__custom"));
    if (selected && ![...select.options].some(option => option.value === selected)) select.add(new Option(selected, selected));
    select.value = selected || "";
  }

  function splitPresentation(product) {
    const text = String(product?.tamanho || "").trim();
    const knownTypes = [...new Set(Object.values(PRESENTATION_TYPES).flat().filter(value => value !== "Personalizado"))].sort((a,b) => b.length - a.length);
    const prefix = knownTypes.find(value => normalizeKey(text).startsWith(normalizeKey(value) + " ") || normalizeKey(text) === normalizeKey(value));
    const storedType = String(product?.embalagem || "").trim();
    const type = prefix || (knownTypes.some(value => normalizeKey(value) === normalizeKey(storedType)) ? storedType : "__custom");
    const remainder = prefix ? text.slice(prefix.length).trim() : "";
    return { type, size: remainder, customText: type === "__custom" ? text : "" };
  }

  function configurePresentationRow(row, categoryId, existing) {
    const typeSelect = row.querySelector('[name="tipo"]');
    const sizeSelect = row.querySelector('[name="tamanho"]');
    const typeCustom = row.querySelector('[name="tipoPersonalizado"]');
    const sizeCustom = row.querySelector('[name="tamanhoPersonalizado"]');
    const parts = existing ? splitPresentation(existing) : null;
    const selectedType = parts ? parts.type : typeSelect.value;
    const currentSize = sizeSelect.value;
    selectOptions(typeSelect, PRESENTATION_TYPES[categoryId] || DEFAULT_TYPES, "Escolha um tipo", selectedType, true);
    const sizeChoices = PRESENTATION_SIZES[categoryId] || DEFAULT_SIZES;
    selectOptions(sizeSelect, sizeChoices, "Escolha um tamanho", currentSize, true, true);
    if (parts) {
      const availableSizes = [...sizeSelect.options].map(option => option.value);
      sizeSelect.value = parts.type === "__custom" ? "__none" : (parts.size ? (availableSizes.includes(parts.size) ? parts.size : "__custom") : "__none");
      if (parts.type === "__custom") typeCustom.value = parts.customText;
      else typeCustom.value = "";
      sizeCustom.value = parts.size && sizeSelect.value === "__custom" ? parts.size : "";
    }
    const typeIsCustom = typeSelect.value === "__custom";
    typeCustom.hidden = typeSelect.value !== "__custom";
    typeCustom.required = !typeCustom.hidden;
    sizeCustom.hidden = sizeSelect.value !== "__custom";
    sizeCustom.required = !sizeCustom.hidden;
    if (!typeIsCustom) typeCustom.value = "";
  }

  function presentationLabel(row) {
    const typeSelect = row.querySelector('[name="tipo"]');
    const sizeSelect = row.querySelector('[name="tamanho"]');
    const type = typeSelect.value === "__custom" ? row.querySelector('[name="tipoPersonalizado"]').value.trim() : typeSelect.value;
    const size = sizeSelect.value === "__custom" ? row.querySelector('[name="tamanhoPersonalizado"]').value.trim() : (sizeSelect.value === "__none" ? "" : sizeSelect.value);
    return [type, size].filter(Boolean).join(" ");
  }

  function updatePresentationHeadings() {
    const rows = [...$("#presentation-list").querySelectorAll(".presentation-row")];
    rows.forEach((row, index) => {
      row.querySelector(".presentation-row-heading h4").textContent = `Apresentação ${index + 1}`;
      row.querySelector("[data-remove-presentation]").disabled = rows.length < 2;
    });
    $("#presentation-add").disabled = rows.length >= 30;
  }

  function addPresentationRow(product=null, familyName="") {
    const template = $("#presentation-template");
    const row = template.content.firstElementChild.cloneNode(true);
    if (product?.id) row.dataset.productId = product.id;
    const name = row.querySelector('[name="nomeEspecifico"]');
    name.value = product && product.nome !== familyName ? product.nome : "";
    const price = row.querySelector('[name="preco"]');
    price.value = product?.precoIndefinido ? "" : (product?.preco ?? "");
    const flags = { precoIndefinido: Boolean(product?.precoIndefinido), disponivel: product ? Boolean(product.disponivel) : true, ativo: product ? Boolean(product.ativo) : true, retornavel: Boolean(product?.retornavel) };
    Object.entries(flags).forEach(([key, value]) => { row.querySelector(`[name="${key}"]`).checked = value; });
    if (product) configurePresentationRow(row, $("#product-form").elements.namedItem("categoria").value, product);
    else configurePresentationRow(row, $("#product-form").elements.namedItem("categoria").value, null);
    price.disabled = flags.precoIndefinido;
    price.required = !flags.precoIndefinido;
    $("#presentation-list").append(row);
    updatePresentationHeadings();
    return row;
  }

  function formSnapshot(form) {
    const values = [...form.querySelectorAll("input, select, textarea")].map(field => field.type === "checkbox" ? [field.name, field.checked] : [field.name, field.value]);
    const rowIds = [...form.querySelectorAll(".presentation-row")].map(row => row.dataset.productId || "");
    return JSON.stringify({ values, rowIds });
  }

  function productFormIsDirty() { return formSnapshot($("#product-form")) !== state.initialFormSnapshot; }

  function lockPageScroll() {
    state.bodyScrollY = window.scrollY;
    document.body.classList.add("modal-open");
    document.body.style.top = `-${state.bodyScrollY}px`;
  }

  function unlockPageScroll() {
    document.body.classList.remove("modal-open");
    document.body.style.top = "";
    window.scrollTo(0, state.bodyScrollY);
  }

  function requestProductClose() {
    if (state.saving) return;
    if (productFormIsDirty() && !window.confirm("Descartar as alterações feitas neste produto?")) return;
    state.initialFormSnapshot = "";
    $("#product-dialog").close();
  }

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
    if (view === "dashboard") setAdminSection(state.adminSection);
    if (view !== "dashboard") setStatus("");
  }

  function setAdminSection(section) {
    if (!["summary", "quick-bill", "products"].includes(section)) section = "summary";
    state.adminSection = section;
    document.querySelectorAll("[data-admin-section]").forEach(button => {
      if (button.dataset.adminSection === section) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    document.querySelectorAll(".admin-section").forEach(panel => { panel.hidden = panel.id !== `admin-section-${section}`; });
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

  function isExamplePrice(product) { return /exemplo|demonstrativo|a confirmar/i.test(String(product?.origem || "")); }

  function setQuickBillStatus(message, isError=false) {
    const box = $("#quick-bill-status");
    box.textContent = message;
    box.classList.toggle("error", isError);
    box.hidden = !message;
  }

  function renderQuickBillProducts() {
    const select = $("#quick-bill-product");
    const selected = select.value;
    select.replaceChildren(new Option("Escolha um produto", ""));
    const products = state.products.filter(product => product.ativo !== false && product.disponivel && product.precoIndefinido !== true && product.preco !== "" && product.preco != null && Number.isFinite(Number(product.preco)))
      .sort((a,b) => (a.grupo || a.nome).localeCompare(b.grupo || b.nome,"pt-BR") || String(a.tamanho || "").localeCompare(String(b.tamanho || ""),"pt-BR"));
    products.forEach(product => {
      const name = product.grupo || product.nome;
      const specificName = product.grupo && product.nome !== product.grupo ? ` · ${product.nome}` : "";
      const example = isExamplePrice(product) ? " · exemplo" : "";
      select.add(new Option(`${name}${specificName} · ${product.tamanho || "Unidade"} · ${money(product.preco)}${example}`, product.id));
    });
    if (products.some(product => String(product.id) === selected)) select.value = selected;
  }

  function renderQuickBill() {
    const list = $("#quick-bill-items");
    list.replaceChildren();
    let totalCents = 0;
    let hasExamplePrice = false;
    state.quickBill.forEach(item => {
      const product = item.product;
      const unitCents = item.priceCents;
      const subtotalCents = unitCents * item.quantity;
      totalCents += subtotalCents;
      hasExamplePrice ||= isExamplePrice(product);

      const row = document.createElement("article");
      row.className = "quick-bill-item";
      const info = document.createElement("div");
      info.className = "quick-bill-item-info";
      const title = document.createElement("strong");
      title.textContent = product.grupo || product.nome;
      const detail = document.createElement("small");
      const specificName = product.grupo && product.nome !== product.grupo ? product.nome : "";
      detail.textContent = [specificName, product.tamanho || "Unidade", `${money(unitCents / 100)} cada`].filter(Boolean).join(" · ");
      info.append(title, detail);

      const subtotal = document.createElement("strong");
      subtotal.className = "quick-bill-subtotal";
      subtotal.textContent = money(subtotalCents / 100);

      const controls = document.createElement("div");
      controls.className = "quick-bill-item-controls";
      const decrease = document.createElement("button");
      decrease.type = "button";decrease.className = "quick-bill-quantity";decrease.dataset.quickChange = "-1";decrease.dataset.id = item.productId;
      decrease.setAttribute("aria-label",`Diminuir quantidade de ${product.grupo || product.nome}`);decrease.textContent="−";
      const quantity = document.createElement("span");quantity.textContent=String(item.quantity);quantity.setAttribute("aria-label",`Quantidade: ${item.quantity}`);
      const increase = document.createElement("button");
      increase.type = "button";increase.className = "quick-bill-quantity";increase.dataset.quickChange = "1";increase.dataset.id = item.productId;increase.disabled=item.quantity>=999;
      increase.setAttribute("aria-label",`Aumentar quantidade de ${product.grupo || product.nome}`);increase.textContent="+";
      const remove = document.createElement("button");
      remove.type="button";remove.className="quick-bill-remove";remove.dataset.quickRemove="true";remove.dataset.id=item.productId;remove.textContent="Remover";
      controls.append(decrease,quantity,increase,remove);
      row.append(info,subtotal,controls);
      list.append(row);
    });
    $("#quick-bill-empty").hidden = state.quickBill.length > 0;
    $("#quick-bill-total").textContent = money(totalCents / 100);
    $("#quick-bill-price-note").hidden = !hasExamplePrice;
    $("#quick-bill-clear").hidden = state.quickBill.length === 0;
  }

  function handleQuickBillSubmit(event) {
    event.preventDefault();
    const product = state.products.find(item => String(item.id) === $("#quick-bill-product").value);
    const selectedQuantity = $("#quick-bill-quantity").value;
    const quantity = selectedQuantity === "custom" ? Number($("#quick-bill-custom-quantity").value) : Number(selectedQuantity);
    if (!product || product.ativo === false || !product.disponivel || product.precoIndefinido || product.preco == null || product.preco === "" || !Number.isFinite(Number(product.preco))) {
      setQuickBillStatus("Escolha um produto disponível e com preço cadastrado.", true);
      return;
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) {
      setQuickBillStatus("Informe uma quantidade entre 1 e 999.", true);
      return;
    }
    const id = String(product.id);
    const existing = state.quickBill.find(item => item.productId === id);
    if (existing && existing.quantity + quantity > 999) {
      setQuickBillStatus("A quantidade máxima por item é 999.", true);
      return;
    }
    if (existing) existing.quantity += quantity;
    else state.quickBill.push({ productId: id, product: { ...product }, quantity, priceCents: Math.round(Number(product.preco) * 100) });
    setQuickBillStatus(`${quantity} ${quantity === 1 ? "unidade adicionada" : "unidades adicionadas"} à conta.`);
    $("#quick-bill-quantity").value = "1";
    $("#quick-bill-custom-label").hidden = true;
    $("#quick-bill-custom-quantity").required = false;
    $("#quick-bill-custom-quantity").value = "11";
    renderQuickBill();
  }

  function handleQuickBillItems(event) {
    const button = event.target.closest("[data-quick-change], [data-quick-remove]");
    if (!button) return;
    const item = state.quickBill.find(entry => entry.productId === button.dataset.id);
    if (!item) return;
    if (button.hasAttribute("data-quick-remove")) state.quickBill = state.quickBill.filter(entry => entry.productId !== button.dataset.id);
    else {
      item.quantity += Number(button.dataset.quickChange);
      if (item.quantity < 1) state.quickBill = state.quickBill.filter(entry => entry.productId !== button.dataset.id);
    }
    setQuickBillStatus("");
    renderQuickBill();
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
    const query = normalizeKey(state.search);
    const filtered = state.products.filter(product => {
      const visible = state.showArchived || product.ativo;
      const categoryMatches = !state.category || product.categoria === state.category;
      const text = normalizeKey([product.nome, product.tamanho, product.subcategoria, product.grupo].join(" "));
      return visible && categoryMatches && text.includes(query);
    });
    const families = new Map();
    filtered.forEach(product => {
      const key = `${product.categoria}::${normalizeKey(product.grupo || product.nome)}`;
      if (!families.has(key)) families.set(key, { product, items: [] });
      families.get(key).items.push(product);
    });
    const grouped = [...families.values()].sort((a,b) => categoryName(a.product.categoria).localeCompare(categoryName(b.product.categoria),"pt-BR") || (a.product.grupo || a.product.nome).localeCompare(b.product.grupo || b.product.nome,"pt-BR"));
    const pageCount = Math.max(1, Math.ceil(grouped.length / state.pageSize));
    state.page = Math.min(state.page, pageCount - 1);
    const pageItems = grouped.slice(state.page * state.pageSize, (state.page + 1) * state.pageSize);
    if (!pageItems.length) {
      const empty = document.createElement("p");
      empty.className = "empty-admin";
      empty.textContent = grouped.length ? "Não há produtos nesta página." : "Nenhum produto encontrado. Ajuste a busca ou adicione um produto.";
      list.append(empty);
    }
    pageItems.forEach(group => list.append(createProductCard(group.product, group.items)));
    const pagination = $("#pagination");
    pagination.hidden = grouped.length <= state.pageSize;
    $("#page-label").textContent = `Página ${state.page + 1} de ${pageCount} · ${grouped.length} grupos`;
    $("#previous-page").disabled = state.page === 0;
    $("#next-page").disabled = state.page >= pageCount - 1;
    updateSummary();
  }

  function createProductCard(product, visibleItems) {
    const card = document.createElement("article");
    const family = familyProducts(product);
    const activeFamily = family.filter(item => item.ativo);
    const availableCount = activeFamily.filter(item => item.disponivel).length;
    const archivedCount = family.length - activeFamily.length;
    const items = visibleItems || family;
    card.className = "admin-product-card" + (activeFamily.length ? "" : " archived");
    const title = document.createElement("div");
    title.className = "admin-product-title";
    const name = document.createElement("h2");
    name.textContent = product.grupo || product.nome;
    const detail = document.createElement("p");
    const details = [categoryName(product.categoria), `${items.length} ${items.length === 1 ? "apresentação" : "apresentações"}`, items.length === 1 ? items[0].tamanho : ""].filter(Boolean);
    detail.textContent = details.join(" · ");
    title.append(name, detail);

    const price = document.createElement("div");
    price.className = "admin-product-price";
    const knownPrices = activeFamily.filter(item => !item.precoIndefinido && item.preco != null && item.preco !== "" && Number.isFinite(Number(item.preco))).map(item => Number(item.preco));
    if (!activeFamily.length || !knownPrices.length) price.textContent = "Consultar";
    else if (knownPrices.length < activeFamily.length) price.textContent = "Ver preços";
    else if (new Set(knownPrices).size > 1) price.textContent = "A partir de " + money(Math.min(...knownPrices));
    else price.textContent = money(knownPrices[0]);
    const priceNote = document.createElement("small");
    priceNote.textContent = activeFamily.length ? `${knownPrices.length} de ${activeFamily.length} com preço` : "Produto arquivado";
    price.append(priceNote);

    const meta = document.createElement("div");
    meta.className = "admin-product-meta";
    const status = document.createElement("span");
    status.className = "admin-pill " + (availableCount ? "available" : "unavailable");
    status.textContent = activeFamily.length ? (availableCount === activeFamily.length ? "Tudo disponível" : availableCount ? `${availableCount}/${activeFamily.length} disponíveis` : "Em falta") : "Arquivado";
    meta.append(status);
    if (archivedCount) {
      const archived = document.createElement("span");
      archived.className = "admin-pill archived-label";
      archived.textContent = `${archivedCount} arquivado${archivedCount === 1 ? "" : "s"}`;
      meta.append(archived);
    }

    const actions = document.createElement("div");
    actions.className = "admin-product-actions";
    const representative = activeFamily[0] || product;
    actions.append(actionButton("edit", activeFamily.length > 1 ? "Editar opções" : "Editar produto", "button button-outline", representative.id));
    card.append(title, price, meta, actions);
    if (items.length > 1) {
      const variants = document.createElement("details");
      variants.className = "admin-variant-details";
      const summary = document.createElement("summary");
      summary.textContent = `Ver apresentações (${items.length})`;
      variants.append(summary);
      const variantList = document.createElement("div");
      variantList.className = "admin-variant-list";
      items.forEach(item => {
        const row = document.createElement("div");
        row.className = "admin-variant-row";
        const label = document.createElement("div");
        label.className = "admin-variant-label";
        const variantName = document.createElement("strong");
        variantName.textContent = [item.nome !== (item.grupo || item.nome) ? item.nome : "", item.tamanho || "Unidade"].filter(Boolean).join(" · ");
        const variantPrice = document.createElement("small");
        variantPrice.textContent = item.precoIndefinido ? "Consultar preço" : money(item.preco);
        label.append(variantName, variantPrice);
        const variantStatus = document.createElement("span");
        variantStatus.className = "admin-pill " + (item.ativo ? (item.disponivel ? "available" : "unavailable") : "archived-label");
        variantStatus.textContent = !item.ativo ? "Arquivado" : item.disponivel ? "Disponível" : "Em falta";
        const variantActions = document.createElement("div");
        variantActions.className = "admin-variant-actions";
        variantActions.append(actionButton("availability", item.disponivel ? "Marcar em falta" : "Disponível", "button button-outline", item.id));
        variantActions.append(actionButton("archive", item.ativo ? "Arquivar" : "Restaurar", "button button-outline", item.id));
        row.append(label, variantStatus, variantActions);
        if (item.retornavel) {
          const returnable = document.createElement("span");
          returnable.className = "admin-pill";
          returnable.textContent = "Retornável";
          row.insertBefore(returnable, variantActions);
        }
        variantList.append(row);
      });
      variants.append(variantList);
      card.append(variants);
    } else {
      const item = items[0] || product;
      if (item.retornavel) {
        const returnable = document.createElement("span");
        returnable.className = "admin-pill";
        returnable.textContent = "Retornável";
        meta.append(returnable);
      }
      actions.append(actionButton("availability", item.disponivel ? "Marcar em falta" : "Marcar disponível", "button button-outline", item.id));
      actions.append(actionButton("archive", item.ativo ? "Arquivar" : "Restaurar", "button button-outline", item.id));
    }
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
    renderQuickBillProducts();
    renderQuickBill();
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
    const variants = product ? familyProducts(product) : [];
    const familyName = product?.grupo || product?.nome || "";
    state.editingProducts = variants.map(item => ({ ...item }));
    form.elements.namedItem("id").value = product?.id || "";
    form.elements.namedItem("nome").value = familyName;
    form.elements.namedItem("categoria").value = product?.categoria || "";
    form.elements.namedItem("subcategoria").value = product?.subcategoria || "";
    form.elements.namedItem("ilustracao").value = product?.ilustracao || "assets/ilustracoes/drink.svg";
    form.elements.namedItem("descricao").value = variants[0]?.descricao || "";
    form.elements.namedItem("ingredientes").value = variants[0]?.ingredientes || "";
    state.commonInitial = {
      descricao: form.elements.namedItem("descricao").value,
      ingredientes: form.elements.namedItem("ingredientes").value,
      subcategoria: form.elements.namedItem("subcategoria").value,
      ilustracao: form.elements.namedItem("ilustracao").value
    };
    $("#presentation-list").replaceChildren();
    if (variants.length) variants.forEach(item => addPresentationRow(item, familyName));
    else addPresentationRow(null, familyName);
    $("#product-dialog-title").textContent = product ? "Editar produto" : "Novo produto";
    state.initialFormSnapshot = formSnapshot(form);
    lockPageScroll();
    $("#product-dialog").showModal();
  }

  async function saveProduct(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const element = name => form.elements.namedItem(name);
    const familyName = element("nome").value.trim();
    const category = element("categoria").value;
    const description = element("descricao").value.trim();
    const ingredients = element("ingredientes").value.trim();
    const rows = [...$("#presentation-list").querySelectorAll(".presentation-row")];
    const savedIds = new Set();
    const products = rows.map(row => {
      const itemId = row.dataset.productId || "";
      if (itemId) savedIds.add(itemId);
      const original = state.editingProducts.find(item => item.id === itemId);
      const priceUnknown = row.querySelector('[name="precoIndefinido"]').checked;
      const type = row.querySelector('[name="tipo"]').value === "__custom" ? row.querySelector('[name="tipoPersonalizado"]').value.trim() : row.querySelector('[name="tipo"]').value;
      const sizeChoice = row.querySelector('[name="tamanho"]').value;
      const size = sizeChoice === "__custom" ? row.querySelector('[name="tamanhoPersonalizado"]').value.trim() : (sizeChoice === "__none" ? "" : sizeChoice);
      const presentation = [type, size].filter(Boolean).join(" ");
      return {
        id: itemId,
        categoria: category,
        subcategoria: original && element("subcategoria").value.trim() === state.commonInitial.subcategoria ? original.subcategoria : element("subcategoria").value.trim(),
        nome: row.querySelector('[name="nomeEspecifico"]').value.trim() || familyName,
        descricao: original && description === state.commonInitial.descricao ? original.descricao : description,
        ingredientes: original && ingredients === state.commonInitial.ingredientes ? original.ingredientes : ingredients,
        tamanho: presentation,
        preco: priceUnknown ? 0 : Number(row.querySelector('[name="preco"]').value || 0),
        precoIndefinido: priceUnknown,
        ilustracao: original && element("ilustracao").value === state.commonInitial.ilustracao ? original.ilustracao : element("ilustracao").value,
        origem: "Atualizado pelo painel administrativo.",
        disponivel: row.querySelector('[name="disponivel"]').checked,
        ativo: row.querySelector('[name="ativo"]').checked,
        retornavel: row.querySelector('[name="retornavel"]').checked,
        embalagem: type,
        grupo: familyName
      };
    });
    state.editingProducts.filter(item => !savedIds.has(item.id)).forEach(item => products.push({ ...item, ativo: false, origem: "Apresentação arquivada pelo painel administrativo." }));
    const button = event.submitter;
    button.disabled = true;
    state.saving = true;
    $("#product-form [data-close='product-dialog']").disabled = true;
    try {
      await window.BarBridge.call("saveProducts", state.token, products);
      state.initialFormSnapshot = "";
      $("#product-dialog").close();
      await loadAdminData();
      setStatus(`${products.length} apresentação${products.length === 1 ? "" : "ões"} salva${products.length === 1 ? "" : "s"} no Google Sheets.`);
    } catch (error) { setStatus(error.message, true); }
    finally { button.disabled = false; state.saving = false; $("#product-form [data-close='product-dialog']").disabled = false; }
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
    $("#dashboard-view").addEventListener("click", event => {
      const button = event.target.closest("[data-admin-section], [data-open-admin-section]");
      if (button) setAdminSection(button.dataset.adminSection || button.dataset.openAdminSection);
    });
    $("#login-form").addEventListener("submit", handleLogin);
    $("#first-password-form").addEventListener("submit", handleFirstPassword);
    $("#product-form").addEventListener("submit", saveProduct);
    $("#product-list").addEventListener("click", handleProductAction);
    $("#category-editor-list").addEventListener("click", handleCategoryAction);
    $("#category-add-form").addEventListener("submit", addCategory);
    $("#change-password-form").addEventListener("submit", changeCurrentPassword);
    $("#quick-bill-form").addEventListener("submit", handleQuickBillSubmit);
    $("#quick-bill-items").addEventListener("click", handleQuickBillItems);
    $("#quick-bill-clear").addEventListener("click", () => { state.quickBill = []; setQuickBillStatus(""); renderQuickBill(); });
    $("#quick-bill-quantity").addEventListener("change", event => {
      const custom = event.target.value === "custom";
      $("#quick-bill-custom-label").hidden = !custom;
      $("#quick-bill-custom-quantity").required = custom;
      if (custom) $("#quick-bill-custom-quantity").focus();
    });
    $("#logout-button").addEventListener("click", logout);
    $("#product-add").addEventListener("click", () => openProduct(null));
    $("#categories-open").addEventListener("click", () => $("#categories-dialog").showModal());
    $("#change-password-open").addEventListener("click", () => $("#change-password-dialog").showModal());
    $("#presentation-add").addEventListener("click", () => addPresentationRow(null, $("#product-form").elements.namedItem("nome").value.trim()));
    $("#product-form").elements.namedItem("categoria").addEventListener("change", event => {
      $("#presentation-list").querySelectorAll(".presentation-row").forEach(row => configurePresentationRow(row, event.target.value, null));
    });
    $("#presentation-list").addEventListener("change", event => {
      const row = event.target.closest(".presentation-row");
      if (!row) return;
      if (event.target.name === "precoIndefinido") {
        const price = row.querySelector('[name="preco"]');
        price.disabled = event.target.checked;
        price.required = !event.target.checked;
        if (event.target.checked) price.value = "";
      }
      if (["tipo", "tamanho"].includes(event.target.name)) configurePresentationRow(row, $("#product-form").elements.namedItem("categoria").value, null);
    });
    $("#presentation-list").addEventListener("click", event => {
      const remove = event.target.closest("[data-remove-presentation]");
      if (!remove || remove.disabled) return;
      remove.closest(".presentation-row").remove();
      updatePresentationHeadings();
    });
    $("#product-search").addEventListener("input", event => { state.search = event.target.value.trim(); state.page = 0; renderProducts(); });
    $("#category-filter").addEventListener("change", event => { state.category = event.target.value; state.page = 0; renderProducts(); });
    $("#show-archived").addEventListener("change", event => { state.showArchived = event.target.checked; state.page = 0; renderProducts(); });
    $("#previous-page").addEventListener("click", () => { state.page = Math.max(0, state.page - 1); renderProducts(); });
    $("#next-page").addEventListener("click", () => { state.page++; renderProducts(); });
    document.querySelectorAll("[data-close]").forEach(button => button.addEventListener("click", () => {
      if (button.dataset.close === "product-dialog") requestProductClose();
      else $("#" + button.dataset.close).close();
    }));
    $("#product-dialog").addEventListener("cancel", event => { event.preventDefault(); requestProductClose(); });
    $("#product-dialog").addEventListener("close", unlockPageScroll);
    window.addEventListener("beforeunload", event => {
      if (!$("#product-dialog").open || !productFormIsDirty()) return;
      event.preventDefault();
      event.returnValue = "";
    });
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

