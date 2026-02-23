/* MOOD bomb menu — local static app */
const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

const state = {
  data: null,
  q: '',
  activeCat: 'all',
  cart: {}, // id -> {id, name, category, priceInt, priceText, qty}
  currentItemId: null,
};

function priceToInt(priceText){
  // "3 200" -> 3200; "3 200 / 2 800" -> take first
  const first = String(priceText).split('/')[0];
  const n = parseInt(first.replace(/[^0-9]/g,''), 10);
  return Number.isFinite(n) ? n : 0;
}

function money(n){
  const s = new Intl.NumberFormat('ru-RU').format(n);
  return `${s} ${state.data?.currency || '₸'}`;
}

function slug(s){
  return String(s).toLowerCase().replace(/ё/g,'е')
    .replace(/[^a-z0-9а-я\s-]/gi,'')
    .trim().replace(/\s+/g,'-').slice(0,80);
}

function loadCart(){
  try{
    const raw = localStorage.getItem('mood_cart_v1');
    if(raw) state.cart = JSON.parse(raw) || {};
  }catch(e){}
}

function saveCart(){
  try{
    localStorage.setItem('mood_cart_v1', JSON.stringify(state.cart));
  }catch(e){}
}

function cartCount(){
  return Object.values(state.cart).reduce((a, it) => a + it.qty, 0);
}
function cartTotal(){
  return Object.values(state.cart).reduce((a, it) => a + it.qty * it.priceInt, 0);
}

function setQty(id, qty){
  qty = Math.max(0, qty|0);
  const existing = state.cart[id];
  if(qty === 0){
    if(existing) delete state.cart[id];
  }else{
    const item = getItemById(id);
    state.cart[id] = {
      id,
      name: item.name,
      category: item.category,
      priceText: item.price,
      priceInt: priceToInt(item.price),
      qty
    };
  }
  saveCart();
  renderCartPill();
  renderMenuQuantities();
}

function inc(id){ setQty(id, (state.cart[id]?.qty || 0) + 1); }
function dec(id){ setQty(id, (state.cart[id]?.qty || 0) - 1); }

function getItemById(id){
  return state.data._itemsById[id];
}

function buildIndex(){
  const items = state.data.menu.map((it, idx) => {
    const id = `${slug(it.category)}__${slug(it.name)}__${idx}`;
    return { id, ...it, priceInt: priceToInt(it.price) };
  });
  const byId = {};
  for(const it of items) byId[it.id] = it;

  const cats = Array.from(new Set(items.map(x => x.category)));
  const grouped = new Map();
  for(const c of cats) grouped.set(c, []);
  for(const it of items) grouped.get(it.category).push(it);

  state.data._items = items;
  state.data._itemsById = byId;
  state.data._cats = cats;
  state.data._grouped = grouped;
}

function applyFilters(){
  const q = state.q.trim().toLowerCase();
  const active = state.activeCat;

  let items = state.data._items;

  if(active !== 'all'){
    items = items.filter(x => x.category === active);
  }
  if(q){
    const normq = q.replace(/ё/g,'е');
    items = items.filter(x => (x.name + ' ' + x.category).toLowerCase().replace(/ё/g,'е').includes(normq));
  }
  return items;
}

function renderTabs(){
  const tabs = $('#tabs');
  tabs.innerHTML = '';

  const make = (label, value, isActive=false) => {
    const btn = document.createElement('button');
    btn.className = 'chip' + (isActive ? ' is-active' : '');
    btn.type = 'button';
    btn.textContent = label;
    btn.onclick = () => {
      state.activeCat = value;
      $$('.chip', tabs).forEach(x => x.classList.remove('is-active'));
      btn.classList.add('is-active');
      render();
      if(value !== 'all'){
        const sec = document.getElementById(`cat-${slug(value)}`);
        if(sec) sec.scrollIntoView({behavior:'smooth', block:'start'});
      }else{
        document.getElementById('top').scrollIntoView({behavior:'smooth', block:'start'});
      }
    };
    return btn;
  };

  tabs.appendChild(make('Все', 'all', true));
  for(const c of state.data._cats){
    tabs.appendChild(make(c, c, false));
  }
  $('#cats').textContent = String(state.data._cats.length);
}

function render(){
  const items = applyFilters();
  $('#found').textContent = String(items.length);

  // group visible items by category
  const byCat = new Map();
  for(const it of items){
    if(!byCat.has(it.category)) byCat.set(it.category, []);
    byCat.get(it.category).push(it);
  }

  const menuEl = $('#menu');
  menuEl.innerHTML = '';

  for(const [cat, list] of byCat.entries()){
    const wrap = document.createElement('section');
    wrap.className = 'cat';
    wrap.id = `cat-${slug(cat)}`;

    const head = document.createElement('div');
    head.className = 'cat__head';
    head.innerHTML = `
      <div class="cat__title">${cat}</div>
      <div class="cat__count">${list.length} поз.</div>
    `;
    wrap.appendChild(head);

    const grid = document.createElement('div');
    grid.className = 'grid';

    for(const it of list){
      const card = document.createElement('div');
      card.className = 'card';
      card.tabIndex = 0;
      card.setAttribute('role','button');
      card.setAttribute('aria-label', it.name);
      card.onclick = () => openItem(it.id);

      const qty = state.cart[it.id]?.qty || 0;

      card.innerHTML = `
        <div class="thumb" aria-hidden="true"><div class="thumb__dot"></div></div>
        <div class="card__body">
          <div class="card__title">${escapeHtml(it.name)}</div>
          <div class="card__meta">
            <div class="price">${escapeHtml(it.price)} ₸</div>
            <div class="stepper" role="group" aria-label="Количество">
              <button class="stepper__btn" data-dec="${it.id}" type="button">−</button>
              <div class="stepper__qty" data-qty="${it.id}">${qty}</div>
              <button class="stepper__btn" data-inc="${it.id}" type="button">+</button>
            </div>
          </div>
        </div>
      `;
      grid.appendChild(card);
    }

    wrap.appendChild(grid);
    menuEl.appendChild(wrap);
  }

  // bind steppers
  $$('[data-inc]').forEach(b => b.addEventListener('click', (e) => { e.stopPropagation(); inc(b.dataset.inc); }));
  $$('[data-dec]').forEach(b => b.addEventListener('click', (e) => { e.stopPropagation(); dec(b.dataset.dec); }));

  renderCartPill();
}

function renderMenuQuantities(){
  $$('[data-qty]').forEach(el => {
    const id = el.dataset.qty;
    el.textContent = String(state.cart[id]?.qty || 0);
  });
  renderCartPill();
}

function renderCartPill(){
  const n = cartCount();
  $('#cartPill').textContent = String(n);
  $('#cartSub').textContent = n ? `Позиций: ${n}` : 'Пусто';
  $('#cartTotal').textContent = money(cartTotal());
}

function renderCart(){
  const list = $('#cartList');
  const items = Object.values(state.cart);
  list.innerHTML = '';

  if(items.length === 0){
    const empty = document.createElement('div');
    empty.className = 'small';
    empty.style.padding = '6px 2px 10px';
    empty.textContent = 'Корзина пустая — добавь блюда кнопками + в меню.';
    list.appendChild(empty);
    renderCartPill();
    return;
  }

  for(const it of items){
    const row = document.createElement('div');
    row.className = 'cartRow';
    row.innerHTML = `
      <div class="cartRow__main">
        <div class="cartRow__title">${escapeHtml(it.name)}</div>
        <div class="cartRow__meta">${escapeHtml(it.category)} • ${escapeHtml(it.priceText)} ₸</div>
      </div>
      <div class="cartRow__right">
        <div class="stepper" role="group" aria-label="Количество">
          <button class="stepper__btn" data-cdec="${it.id}" type="button">−</button>
          <div class="stepper__qty">${it.qty}</div>
          <button class="stepper__btn" data-cinc="${it.id}" type="button">+</button>
        </div>
        <div class="price">${money(it.qty * it.priceInt)}</div>
      </div>
    `;
    list.appendChild(row);
  }

  $$('[data-cinc]').forEach(b => b.addEventListener('click', () => { inc(b.dataset.cinc); renderCart(); }));
  $$('[data-cdec]').forEach(b => b.addEventListener('click', () => { dec(b.dataset.cdec); renderCart(); }));
  renderCartPill();
}

function openItem(id){
  state.currentItemId = id;
  const it = getItemById(id);
  const qty = state.cart[id]?.qty || 0;

  $('#itemCat').textContent = it.category;
  $('#itemPrice').textContent = `${it.price} ₸`;
  $('#itemTitle').textContent = it.name;
  $('#itemDesc').textContent = 'Нажми “Добавить”, чтобы положить в корзину. Количество можно менять кнопками −/+.';
  $('#itemQty').textContent = String(qty);

  const dlg = $('#itemDialog');
  if(typeof dlg.showModal === 'function') dlg.showModal();
}

function closeDialog(dlg){
  try{ dlg.close(); }catch(e){}
}

function escapeHtml(s){
  return String(s)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#039;');
}

async function main(){
  const res = await fetch('assets/menu.json', {cache:'no-store'});
  state.data = await res.json();
  buildIndex();
  loadCart();
  renderTabs();
  render();

  const q = $('#q');
  q.addEventListener('input', () => {
    state.q = q.value;
    $('#clearQ').style.display = state.q ? 'inline-flex' : 'none';
    render();
  });
  $('#clearQ').onclick = () => { q.value=''; state.q=''; $('#clearQ').style.display='none'; render(); };

  $('#printBtn').onclick = () => window.print();

  $('#openCart').onclick = () => {
    const dlg = $('#cartDialog');
    renderCart();
    if(typeof dlg.showModal === 'function') dlg.showModal();
  };

  $('#clearCart').onclick = () => {
    state.cart = {};
    saveCart();
    renderCart();
    renderMenuQuantities();
  };

  $('#printCart').onclick = () => {
    // print only — user can save as PDF
    closeDialog($('#cartDialog'));
    window.print();
  };

  $('#addItem').onclick = () => {
    if(!state.currentItemId) return;
    inc(state.currentItemId);
    $('#itemQty').textContent = String(state.cart[state.currentItemId]?.qty || 0);
  };
  $('#incItem').onclick = () => {
    if(!state.currentItemId) return;
    inc(state.currentItemId);
    $('#itemQty').textContent = String(state.cart[state.currentItemId]?.qty || 0);
  };
  $('#decItem').onclick = () => {
    if(!state.currentItemId) return;
    dec(state.currentItemId);
    $('#itemQty').textContent = String(state.cart[state.currentItemId]?.qty || 0);
  };

  // nice: close dialog on click outside
  for(const dlg of [$('#itemDialog'), $('#cartDialog')]){
    dlg.addEventListener('click', (e) => {
      const rect = dlg.getBoundingClientRect();
      const inPanel =
        e.clientX >= rect.left && e.clientX <= rect.right &&
        e.clientY >= rect.top && e.clientY <= rect.bottom;
      if(e.target === dlg) closeDialog(dlg);
    });
  }

  // register service worker (optional)
  if('serviceWorker' in navigator){
    try{ await navigator.serviceWorker.register('sw.js'); }catch(e){}
  }
}

main().catch(err => {
  console.error(err);
  document.body.innerHTML = '<div style="padding:18px;font-family:system-ui;color:white">Ошибка загрузки меню. Проверь, что папка assets рядом с index.html.</div>';
});
