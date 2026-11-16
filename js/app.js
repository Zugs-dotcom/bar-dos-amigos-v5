(() => {
  "use strict";
  const $ = (s, r=document) => r.querySelector(s);
  const state = { categorias:[], produtos:[], sobre:{}, categoria:"todas", subcategoria:"", busca:"" };
  const money = v => Number(v||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
  const safe = (v, fallback="") => v == null || String(v).trim()==="" ? fallback : String(v);
  const demoPrice = p => /exemplo|demonstrativo|a confirmar/i.test(p?.origem||"");
  const groupedCategories = new Set(["cervejas","refrigerantes","aguas","energeticos","salgados","porcoes"]);
  const categoryNames = {cervejas:"Cerveja",refrigerantes:"Refrigerante",aguas:"Bebida",energeticos:"Energético",destilados:"Destilado",salgados:"Salgado",porcoes:"Porção",drinks:"Drink"};
  function applyData(d, cache=false){
    state.categorias=(d.categorias||[]).filter(x=>x.ativa!==false).sort((a,b)=>(a.ordem||0)-(b.ordem||0));
    state.produtos=(d.produtos||[]).filter(x=>x.ativo!==false);
    state.sobre=d.sobre||{};
    if(cache){try{localStorage.setItem(BAR_CONFIG.cacheKey,JSON.stringify({categorias:state.categorias,produtos:state.produtos,sobre:state.sobre,salvoEm:new Date().toISOString()}));}catch(e){}}
    renderCategories();renderSubcategories();renderProducts();renderAbout();
  }
  function loadInitialData(){
    const fallback=window.DADOS_DEMO||{};
    try{const saved=JSON.parse(localStorage.getItem(BAR_CONFIG.cacheKey)||"null");if(saved?.produtos?.length)applyData(saved);else applyData(fallback);}catch(e){applyData(fallback);}
  }
  async function loadLiveCatalog(){
    const banner=$("#connection-status");
    if(!window.BarBridge?.available()){
      banner.textContent="Catálogo local V4.4. Configure o Apps Script para sincronizar preços e disponibilidade do Google Sheets.";
      banner.hidden=false;
      return;
    }
    try{
      const result=await window.BarBridge.call("menu");
      if(result?.produtos&&result?.categorias){applyData(result,true);banner.hidden=true;}
    }catch(error){
      banner.textContent="Não foi possível atualizar agora. Exibindo a última versão salva neste aparelho.";
      banner.classList.add("error");banner.hidden=false;
    }
  }
  function productGroups(products){
    const map=new Map();
    products.forEach(p=>{
      const key=p.grupo ? `${p.categoria}::familia::${p.grupo.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase()}` : (groupedCategories.has(p.categoria) ? `${p.categoria}::${p.nome.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase()}` : `${p.id}`);
      if(!map.has(key)) map.set(key,{id:key,nome:p.grupo||p.nome,categoria:p.categoria,subcategoria:p.subcategoria,ilustracao:p.ilustracao,items:[]});
      map.get(key).items.push(p);
    });
    const groups=[...map.values()];
    const collator=new Intl.Collator("pt-BR",{sensitivity:"base",numeric:true});
    const presentationOrder = value => {
      const s=(value||"").toLocaleLowerCase("pt-BR");
      if(s.startsWith("lata")) return 1;
      if(s==="long neck") return 2;
      if(s.startsWith("garrafa")) return 3;
      if(s==="dose") return 4;
      if(s==="pequena") return 1;
      if(s==="grande") return 2;
      if(s==="porção") return 3;
      return 5;
    };
    groups.forEach(g=>g.items.sort((a,b)=>presentationOrder(a.tamanho)-presentationOrder(b.tamanho)||collator.compare(a.tamanho||"",b.tamanho||"")));
    return groups.sort((a,b)=>collator.compare(a.nome,b.nome));
  }
  function renderCategories(){
    const c=$("#category-list"); c.replaceChildren();
    [{id:"todas",nome:"Tudo"},...state.categorias].forEach(cat=>{
      const b=document.createElement("button"); b.type="button"; b.className="category-chip"+(state.categoria===cat.id?" active":"");
      b.textContent=cat.nome;b.setAttribute("aria-pressed",String(state.categoria===cat.id));
      b.addEventListener("click",()=>{state.categoria=cat.id;state.subcategoria="";renderCategories();renderSubcategories();renderProducts();});c.append(b);
    });
  }
  function renderSubcategories(){
    const s=$("#subcategory-select"), prev=state.subcategoria;
    const items=state.produtos.filter(p=>state.categoria==="todas"||p.categoria===state.categoria);
    const values=[...new Set(items.map(p=>p.subcategoria).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"pt-BR"));
    s.replaceChildren(new Option("Todos os tipos",""));values.forEach(v=>s.add(new Option(v,v)));
    state.subcategoria=values.includes(prev)?prev:"";s.value=state.subcategoria;
  }
  function visibleGroups(){
    const q=state.busca.toLocaleLowerCase("pt-BR");
    const filtered=state.produtos.filter(p=>{
      const cm=state.categoria==="todas"||p.categoria===state.categoria;
      const sm=!state.subcategoria||p.subcategoria===state.subcategoria;
      const text=[p.nome,p.descricao,p.subcategoria,p.tamanho].join(" ").toLocaleLowerCase("pt-BR");
      return cm&&sm&&text.includes(q);
    });
    return productGroups(filtered);
  }
  function makeImage(path,cls="svg-illustration"){
    const img=document.createElement("img");img.src=path||"assets/ilustracoes/drink.svg";img.alt="";img.loading="lazy";img.className=cls;return img;
  }
  function usefulDescription(product){
    const value=safe(product?.descricao).trim();
    if(!value)return "";
    const normalized=value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("pt-BR");
    if(/a confirmar|nao informado|preco ainda nao informado/.test(normalized))return "";
    if(/(consulte|fale com).*(atendente|balcao|equipe|sabores|disponibilidade|valores|precos?)/.test(normalized))return "";
    if(/consulte.*(atendente|balcao|equipe).*(disponibilidade|valores|precos?)/.test(normalized))return "";
    if(/opcao de (bebida|produto).*(consulte|disponibilidade)/.test(normalized))return "";
    if(/consulte os sabores e tamanhos disponiveis/.test(normalized))return "";
    if(/salgadinho de pacote.*consulte sabores/.test(normalized))return "";
    const compact=value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("pt-BR");
    const productName=safe(product?.nome).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("pt-BR");
    const size=safe(product?.tamanho).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("pt-BR");
    if(productName&&size&&compact.includes(productName)&&compact.includes(size)&&compact.split(/\s+/).length<=9)return "";
    return value;
  }
  function presentationText(group){
    const values=[...new Set(group.items.map(item=>{
      const label=[item.nome!==group.nome?item.nome:"",item.tamanho||""].filter(Boolean).join(" · ");
      return label;
    }).filter(Boolean))];
    const shown=values.slice(0,3);
    return shown.join(" · ")+(values.length>3?` · +${values.length-3} opções`:"");
  }
  function renderProducts(){
    const grid=$("#product-grid"), groups=visibleGroups();grid.replaceChildren();grid.setAttribute("aria-busy","true");
    groups.forEach(group=>{
      const soldOut=group.items.every(x=>!x.disponivel);
      const card=document.createElement("article");card.className="product-card"+(soldOut?" is-unavailable":"");
      const art=document.createElement("div");art.className="product-art";
      const illustration=document.createElement("span");illustration.className="product-illustration";illustration.append(makeImage(group.ilustracao));
      const tag=document.createElement("span");tag.className="product-tag"+(soldOut?" sold":"");tag.textContent=soldOut?"INDISPONÍVEL":(group.items.length>1?"VÁRIAS OPÇÕES":"DISPONÍVEL");art.append(illustration,tag);
      const info=document.createElement("div");info.className="product-info";
      const cat=document.createElement("span");cat.className="product-category";cat.textContent=group.subcategoria||categoryNames[group.categoria]||group.categoria;
      const title=document.createElement("h4");title.textContent=group.nome;
      info.append(cat,title);
      const presentation=presentationText(group);
      if(presentation){const label=document.createElement("p");label.className="product-presentation";label.textContent=presentation;info.append(label);}
      const description=group.items.map(usefulDescription).find(Boolean);
      if(description){const desc=document.createElement("p");desc.className="product-description";desc.textContent=description;info.append(desc);}
      const bottom=document.createElement("div");bottom.className="product-bottom";
      const price=document.createElement("strong");price.className="product-price";
      const availableItems=group.items.filter(item=>item.disponivel);
      const knownPrices=availableItems.filter(item=>!item.precoIndefinido).map(item=>Number(item.preco||0));
      if(soldOut)price.textContent="Indisponível";
      else if(!knownPrices.length)price.textContent="Consulte no balcão";
      else if(knownPrices.length<availableItems.length)price.textContent="Ver preços";
      else if(group.items.length>1&&new Set(knownPrices).size>1)price.textContent="A partir de "+money(Math.min(...knownPrices));
      else price.textContent=money(knownPrices[0]);
      if(group.items.every(demoPrice)&&knownPrices.length){const small=document.createElement("small");small.textContent="VALOR EXEMPLO";price.append(small);}
      const btn=document.createElement("button");btn.type="button";btn.className="detail-button";btn.textContent=group.items.length>1?"VER OPÇÕES +":"DETALHES +";btn.addEventListener("click",()=>openDetails(group));
      bottom.append(price,btn);info.append(bottom);card.append(art,info);grid.append(card);
    });
    $("#product-count").textContent=String(groups.length).padStart(2,"0");
    $("#current-category").textContent=state.categoria==="todas"?"Todas as opções":(state.categorias.find(x=>x.id===state.categoria)?.nome||"Cardápio");
    $("#empty-state").hidden=groups.length!==0;grid.setAttribute("aria-busy","false");
  }
  function openDetails(group){
    const c=$("#dialog-content");c.replaceChildren();
    const body=document.createElement("div");body.className="dialog-body";
    const head=document.createElement("div");head.className="dialog-product-head";
    const art=document.createElement("div");art.className="dialog-art";art.append(makeImage(group.ilustracao));
    const title=document.createElement("h2");title.id="dialog-title";title.textContent=group.nome;
    head.append(art,title);
    if(group.items.length>1){const description=document.createElement("p");description.className="dialog-description";description.textContent="Apresentações disponíveis:";head.append(description);}
    else {const description=usefulDescription(group.items[0]);if(description){const text=document.createElement("p");text.className="dialog-description";text.textContent=description;head.append(text);}}
    body.append(head);
    group.items.forEach(p=>{
      const option=document.createElement("div");option.className="variant-option";
      const main=document.createElement("div");main.className="variant-main";
      const name=document.createElement("strong");name.textContent=(p.nome!==group.nome?p.nome+" — ":"")+safe(p.tamanho,categoryNames[p.categoria]||"Opção");
      const price=document.createElement("span");price.className="variant-price";
      if(!p.disponivel){price.textContent="Indisponível no momento";} else if(p.precoIndefinido){price.textContent=p.categoria==="destilados"?"Dose • consulte o valor":"Consulte o valor";}
      else {price.textContent=money(p.preco)+(demoPrice(p)?" • EXEMPLO":" • INFORMADO");}
      main.append(name,price);option.append(main);
      if(!p.disponivel){const unavailable=document.createElement("small");unavailable.textContent="Temporariamente em falta";option.append(unavailable);}
      if(p.retornavel){const note=document.createElement("small");note.textContent="Garrafa retornável";option.append(note);}
      if(p.categoria==="destilados"){
        const bottle=document.createElement("small");bottle.className="variant-note";bottle.textContent="Para consultar o valor da garrafa, fale com os atendentes.";option.append(bottle);
      }
      const ingredients=safe(p.ingredientes);
      if(["salgados","porcoes","drinks"].includes(p.categoria)&&ingredients&& !/não informado|a confirmar|conforme embalagem/i.test(ingredients)){
        const ing=document.createElement("small");ing.className="variant-note";ing.textContent="Ingredientes: "+ingredients;option.append(ing);
      }
      option.classList.add("variant-option");body.append(option);
    });
    if(group.items.some(p=>p.precoIndefinido)||group.items.some(demoPrice)){const note=document.createElement("p");note.className="dialog-demo";note.textContent=group.items.some(demoPrice)?"Valores marcados como exemplo precisam ser confirmados.":"Alguns valores precisam ser confirmados com a equipe.";body.append(note);}
    c.append(body);$("#product-dialog").showModal();
  }
  function renderAbout(){
    document.querySelectorAll("[data-about]").forEach(el=>{el.textContent=safe(state.sobre[el.dataset.about],"A preencher pelos proprietários");});
    const w=String(state.sobre.whatsapp||"").replace(/\D/g,"");
    if(w){const a=$("#whatsapp-link");a.href="https://wa.me/"+w+"?text="+encodeURIComponent("Olá! Gostaria de consultar o cardápio do Bar dos Amigos.");a.hidden=false;}
    if(state.sobre.maps){$("#maps-link").href=state.sobre.maps;$("#maps-link").hidden=false;}
  }
  function bindEvents(){
    $("#search-input").addEventListener("input",e=>{state.busca=e.target.value.trim();renderProducts();});
    $("#subcategory-select").addEventListener("change",e=>{state.subcategoria=e.target.value;renderProducts();});
    $("#clear-filters").addEventListener("click",()=>{state.categoria="todas";state.subcategoria="";state.busca="";$("#search-input").value="";renderCategories();renderSubcategories();renderProducts();});
    $("#dialog-close").addEventListener("click",()=>$("#product-dialog").close());
    $("#product-dialog").addEventListener("click",e=>{if(e.target===$("#product-dialog"))$("#product-dialog").close();});
    document.addEventListener("keydown",e=>{if(e.key==="Escape"&&$("#product-dialog").open)$("#product-dialog").close();});
  }
  async function init(){loadInitialData();bindEvents();await loadLiveCatalog();}
  document.addEventListener("DOMContentLoaded",init);
})();
