(function () {
  var D = window.CREMESP;
  var STORE = 'cremesp_plus_extra';

  /* ---------- utilidades ---------- */
  function $(s, r) { return (r || document).querySelector(s); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function qs() { return new URLSearchParams(location.search); }
  function saved() {
    try { return JSON.parse(localStorage.getItem(STORE) || '[]'); } catch (e) { return []; }
  }
  function saveList(list) {
    try { localStorage.setItem(STORE, JSON.stringify(list)); } catch (e) {}
  }
  function all() {
    var extra = saved().filter(function (i) { return i.status !== 'rascunho'; });
    return D.conteudos.concat(extra);
  }
  function byId(id) { return all().filter(function (i) { return i.id === id; })[0]; }
  function tema(id) { return D.temas.filter(function (t) { return t.id === id; })[0]; }
  function temaNome(id) { var t = tema(id); return t ? t.nome : ''; }
  function tipo(id) { return D.tipos.filter(function (t) { return t.id === id; })[0]; }
  function rot(i) { return i.rotulo || (tipo(i.tipo) ? tipo(i.tipo).singular : ''); }
  // Capa = um quadro do próprio vídeo (o YouTube gera 3: ~25%, ~50% e ~75%). Padrão: o do meio.
  // video.capa pode ser 1, 2, 3, ou o caminho de uma imagem sua (ex.: 'assets/capas/congresso.jpg').
  function thumb(v) {
    var c = v.capa;
    if (typeof c === 'string' && c.indexOf('.') > -1) return c;
    var n = (c === 1 || c === 2 || c === 3) ? c : 2;
    return 'https://i.ytimg.com/vi/' + v.id + '/hq' + n + '.jpg';
  }
  window.__thumbErr = function (img) {
    if (!img.getAttribute('data-f')) {
      img.setAttribute('data-f', '1');
      img.src = 'https://i.ytimg.com/vi/' + img.getAttribute('data-id') + '/hqdefault.jpg';
    } else { img.style.display = 'none'; }
  };
  function href(i) { return 'evento.html?id=' + encodeURIComponent(i.id); }

  function parseYT(input) {
    try {
      var u = new URL(String(input).trim());
      var h = u.hostname.replace(/^www\.|^m\./, '');
      var id = null;
      if (h === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
      else if (h === 'youtube.com' || h === 'youtube-nocookie.com') {
        if (u.pathname === '/watch') id = u.searchParams.get('v');
        else {
          var m = u.pathname.match(/^\/(live|embed|shorts)\/([\w-]{11})/);
          if (m) id = m[2];
        }
      } else return null;
      if (!id || !/^[\w-]{11}$/.test(id)) return null;
      var start = 0;
      var t = u.searchParams.get('t') || u.searchParams.get('start');
      if (t && !isNaN(parseInt(t, 10))) start = parseInt(t, 10);
      return { id: id, start: start };
    } catch (e) { return null; }
  }

  /* ---------- ícones ---------- */
  var ic = {
    live: '<rect x="3" y="6" width="13" height="12" rx="2"></rect><path d="M16 10l5-3v10l-5-3"></path>',
    congresso: '<rect x="4" y="3" width="16" height="18" rx="1"></rect><path d="M9 8h2M13 8h2M9 12h2M13 12h2M10 21v-4h4v4"></path>',
    palestra: '<rect x="9" y="3" width="6" height="11" rx="3"></rect><path d="M5 11a7 7 0 0 0 14 0M12 18v3"></path>',
    institucional: '<path d="M3 10l9-6 9 6M5 10v9M9 10v9M15 10v9M19 10v9M3 21h18"></path>',
    etica: '<path d="M12 3v18M7 21h10M5 7h14M5 7l-3 7a3 3 0 0 0 6 0zM19 7l-3 7a3 3 0 0 0 6 0z"></path>',
    'saude-mental': '<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2 4 4 0 0 1 7 2c0 5.5-7 10-7 10z"></path>',
    seguranca: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"></path>',
    normas: '<path d="M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h7"></path>',
    tecnologia: '<rect x="6" y="6" width="12" height="12" rx="2"></rect><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"></path>',
    acervo: '<circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path>'
  };
  function icon(name, size, color) {
    return '<svg width="' + (size || 20) + '" height="' + (size || 20) + '" viewBox="0 0 24 24" fill="none" stroke="' + (color || '#fff') +
      '" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ic[name] || ic.acervo) + '</svg>';
  }
  function chev(open) {
    return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' +
      (open ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6') + '"></path></svg>';
  }
  var PLAY = '<svg width="30" height="30" viewBox="0 0 24 24" fill="#05644B" aria-hidden="true"><path d="M8 5v14l11-7z"></path></svg>';
  var PLAY_SM = '<svg width="18" height="18" viewBox="0 0 24 24" fill="#05644B" aria-hidden="true"><path d="M8 5v14l11-7z"></path></svg>';

  /* ---------- player (o vídeo só carrega ao clicar) ---------- */
  function player(v) {
    return '<div class="player" data-vid="' + esc(v.id) + '" data-start="' + esc(v.start || '') + '" data-end="' + esc(v.end || '') + '">' +
      '<img src="' + thumb(v) + '" data-id="' + esc(v.id) + '" alt="" onerror="__thumbErr(this)">' +
      (v.aoVivo ? '<span class="live">AO VIVO</span>' : '') +
      '<button type="button" class="play" aria-label="Assistir ao vídeo">' + PLAY + '</button>' +
      '<span class="hint">Vídeo do YouTube. Carrega ao clicar.</span></div>';
  }
  document.addEventListener('click', function (e) {
    var p = e.target.closest ? e.target.closest('.player') : null;
    if (!p || p.querySelector('iframe')) return;
    var url = 'https://www.youtube-nocookie.com/embed/' + p.getAttribute('data-vid') + '?autoplay=1&rel=0';
    if (p.getAttribute('data-start')) url += '&start=' + p.getAttribute('data-start');
    if (p.getAttribute('data-end')) url += '&end=' + p.getAttribute('data-end');
    p.innerHTML = '<iframe src="' + url + '" title="Vídeo do YouTube" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>';
  });

  /* ---------- cartões ---------- */
  function card(i) {
    return '<a class="card" href="' + href(i) + '"><div class="thumb"><img loading="lazy" src="' + thumb(i.video) + '" data-id="' + esc(i.video.id) + '" alt="" onerror="__thumbErr(this)">' +
      '<span class="play-sm">' + PLAY_SM + '</span>' + (i.video.aoVivo ? '<span class="live">AO VIVO</span>' : '') + '</div>' +
      '<div class="card-t">' + esc(i.titulo) + '</div><div class="card-m">' + esc(rot(i)) + ' · ' + esc(temaNome(i.tema)) + '</div></a>';
  }
  function cards(list) { return '<div class="grid">' + list.map(card).join('') + '</div>'; }

  /* ---------- casca: topo + barra lateral ---------- */
  function logoHTML() {
    return '<span class="logo-slot"><img src="assets/logo-cremesp.png" alt="CREMESP" onerror="this.parentNode.innerHTML=\'<span class=&quot;logo-ph&quot;>LOGOTIPO OFICIAL CREMESP<br>(assets/logo-cremesp.png)</span>\'"></span>';
  }
  function topbar(page) {
    var el = $('#topbar');
    el.className = 'topbar';
    el.innerHTML =
      '<button type="button" class="burger" id="burger" aria-label="Abrir menu de tópicos"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#05644B" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"></path></svg></button>' +
      '<a class="brand" href="index.html">' + logoHTML() + '<span class="wordmark">Cremesp<b>+</b></span></a>' +
      '<form class="search" action="lista.html" method="get" role="search"><input type="search" name="q" aria-label="Buscar conteúdos" placeholder="Buscar palestras, congressos, temas…"></form>' +
      '<nav class="topnav" aria-label="Principal"><a href="index.html"' + (page === 'home' ? ' class="on"' : '') + '>Início</a>' +
      '<a href="lista.html?v=todos"' + (page === 'lista' ? ' class="on"' : '') + '>Todos os conteúdos</a>' +
      '<a class="ext" href="https://www.cremesp.org.br" target="_blank" rel="noopener">Site do CREMESP</a></nav>';
  }

  function sidebar(cur) {
    var side = $('#sidebar');
    if (!side) return;
    var items = all();
    var liveCount = items.filter(function (i) { return i.video.aoVivo; }).length;
    var q = qs();
    var h = '<div class="lbl">EVENTOS</div>';
    h += '<a class="nav-item' + (cur.v === 'aovivo' ? ' on' : '') + '" href="lista.html?v=aovivo">' + icon('live') + '<span class="grow">Transmissões ao Vivo</span>' +
      (liveCount ? '<span class="pill">' + liveCount + ' ao vivo</span>' : '') + '</a>';
    D.tipos.forEach(function (t) {
      var list = items.filter(function (i) { return i.tipo === t.id; });
      var open = (cur.tipo === t.id) || (cur.item && cur.item.tipo === t.id) || (q.get('tipo') === t.id);
      h += '<button type="button" class="nav-item' + (open ? ' on' : '') + '" data-toggle="' + t.id + '" aria-expanded="' + open + '">' + icon(t.id) +
        '<span class="grow">' + esc(t.nome) + '</span>' + chev(open) + '</button>';
      h += '<div class="sub" id="sub-' + t.id + '"' + (open ? '' : ' hidden') + '>';
      if (!list.length) h += '<a class="all" href="lista.html?tipo=' + t.id + '">Nenhum conteúdo ainda</a>';
      list.forEach(function (i) {
        h += '<a href="' + href(i) + '"' + (cur.item && cur.item.id === i.id ? ' class="on"' : '') + '>' + esc(i.titulo) + '</a>';
      });
      if (list.length) h += '<a class="all" href="lista.html?tipo=' + t.id + '">Ver todos</a>';
      h += '</div>';
    });
    h += '<div class="lbl">TEMAS</div>';
    D.temas.forEach(function (t) {
      var n = items.filter(function (i) { return i.tema === t.id; }).length;
      var on = (q.get('tema') === t.id) || (cur.item && cur.item.tema === t.id && false);
      h += '<a class="nav-item' + (on ? ' on' : '') + '" href="lista.html?tema=' + t.id + '">' + icon(t.id) + '<span class="grow">' + esc(t.nome) + '</span><span class="count">' + n + '</span></a>';
    });
    h += '<div class="lbl">ACERVO</div>';
    h += '<a class="nav-item' + (cur.v === 'acervo' ? ' on' : '') + '" href="lista.html?v=acervo">' + icon('acervo') + '<span class="grow">Acervo Histórico</span></a>';
    h += '<a class="admin-link" href="admin.html">Área administrativa (demonstração)</a>';
    side.innerHTML = h;
    side.className = 'side';
    side.addEventListener('click', function (e) {
      var b = e.target.closest('[data-toggle]');
      if (!b) return;
      var sub = $('#sub-' + b.getAttribute('data-toggle'));
      var open = sub.hasAttribute('hidden');
      if (open) sub.removeAttribute('hidden'); else sub.setAttribute('hidden', '');
      b.setAttribute('aria-expanded', open);
      b.lastElementChild.outerHTML = chev(open);
    });
    var burger = $('#burger'), scrim = $('#scrim');
    if (burger) burger.addEventListener('click', function () {
      side.classList.toggle('open'); scrim.classList.toggle('open');
    });
    if (scrim) scrim.addEventListener('click', function () {
      side.classList.remove('open'); scrim.classList.remove('open');
    });
  }

  /* ---------- páginas ---------- */
  function pageHome() {
    var items = all();
    var main = $('#content');
    if (!items.length) { main.innerHTML = '<div class="empty">Nenhum conteúdo publicado ainda.</div>'; return; }
    var hero = items.filter(function (i) { return i.hero; })[0] || items[0];
    var rest = items.filter(function (i) { return i !== hero; });
    var meta = [rot(hero), temaNome(hero.tema), hero.data].filter(Boolean).join(' · ');
    main.innerHTML =
      '<section class="hero">' + player(hero.video) +
      '<div class="hero-text"><a class="chip" href="lista.html?tema=' + hero.tema + '">' + esc(temaNome(hero.tema)) + '</a>' +
      '<h1>' + esc(hero.titulo) + '</h1><p>' + esc(hero.intro) + '</p><div class="meta">' + esc(meta) + '</div>' +
      '<div class="actions"><a class="btn" href="' + href(hero) + '">Ver página do evento</a></div></div></section>' +
      (rest.length ? '<h2 class="sec">' + icon('palestra', 24, '#009964') + 'CORTES E DESTAQUES<a href="lista.html?v=todos">Ver todos</a></h2>' + cards(rest) : '');
  }

  function pageEvento() {
    var main = $('#content');
    var item = byId(qs().get('id'));
    if (!item) {
      sidebar({});
      main.innerHTML = '<div class="empty">Conteúdo não encontrado. <a href="index.html">Voltar ao início</a></div>';
      return null;
    }
    sidebar({ item: item });
    document.title = item.titulo + ' · Cremesp+';
    var t = tipo(item.tipo);
    var parent = item.parent ? byId(item.parent) : null;
    var children = all().filter(function (i) { return i.parent === item.id; });
    var related = all().filter(function (i) { return i.tema === item.tema && i.id !== item.id && i.parent !== item.id && i.id !== item.parent; });
    var meta = [rot(item), temaNome(item.tema), item.realizacao ? 'Realização: ' + item.realizacao : '', item.data].filter(Boolean).join(' · ');
    var waves = '<svg viewBox="0 0 1000 200" preserveAspectRatio="none" aria-hidden="true"><path d="M420 0H1000V200H700C820 150 760 60 420 0Z" fill="#009964" fill-opacity=".6"></path><path d="M640 0H1000V100C920 120 800 70 640 0Z" fill="#8CCFB7" fill-opacity=".32"></path><path d="M0 170C200 140 420 190 700 200H0Z" fill="#8CCFB7" fill-opacity=".16"></path></svg>';
    var info = '<dl><div><dt>Área temática</dt><dd>' + esc(temaNome(item.tema)) + '</dd></div><div><dt>Tipo</dt><dd>' + esc(rot(item)) + '</dd></div>' +
      (item.realizacao ? '<div><dt>Realização</dt><dd>' + esc(item.realizacao) + '</dd></div>' : '') +
      (item.data ? '<div><dt>Data</dt><dd>' + esc(item.data) + '</dd></div>' : '') +
      (parent ? '<div><dt>Faz parte de</dt><dd><a href="' + href(parent) + '">' + esc(parent.titulo) + '</a></dd></div>' : '') + '</dl>' +
      '<button type="button" class="btn line" id="copy">Copiar link</button>';
    main.innerHTML =
      '<nav class="crumbs" aria-label="Caminho"><a href="index.html">Início</a><span>›</span><a href="lista.html?tipo=' + item.tipo + '">' + esc(t ? t.nome : '') + '</a><span>›</span><b>' + esc(item.titulo) + '</b></nav>' +
      '<section class="band">' + waves + '<div class="band-in"><a class="chip" href="lista.html?tema=' + item.tema + '">' + esc(temaNome(item.tema)) + '</a><h1>' + esc(item.titulo) + '</h1><div class="meta">' + esc(meta) + '</div></div></section>' +
      '<div class="cols"><div class="stack">' + player(item.video) +
      '<div class="panel"><h2>Sobre este conteúdo</h2><p>' + esc(item.intro) + '</p></div></div>' +
      '<aside class="panel info"><h2>Informações</h2>' + info + '</aside></div>' +
      (children.length ? '<h2 class="sec">' + icon('palestra', 24, '#009964') + 'CORTES E DESTAQUES DESTE CONGRESSO</h2>' + cards(children) : '') +
      (related.length ? '<h2 class="sec">' + icon('acervo', 24, '#009964') + 'MAIS EM ' + esc(temaNome(item.tema).toUpperCase()) + '</h2>' + cards(related) : '');
    var copy = $('#copy');
    copy.addEventListener('click', function () {
      var done = function () { copy.textContent = 'Link copiado'; setTimeout(function () { copy.textContent = 'Copiar link'; }, 2000); };
      if (navigator.clipboard) navigator.clipboard.writeText(location.href).then(done, done); else done();
    });
    return item;
  }

  function pageLista() {
    var q = qs();
    var items = all(), title = 'Todos os conteúdos', note = '', list = items, extra = '';
    var cur = {};
    if (q.get('tema')) { title = temaNome(q.get('tema')) || 'Tema'; list = items.filter(function (i) { return i.tema === q.get('tema'); }); }
    else if (q.get('tipo')) { var t = tipo(q.get('tipo')); title = t ? t.nome : 'Conteúdos'; list = items.filter(function (i) { return i.tipo === q.get('tipo'); }); cur.tipo = q.get('tipo'); }
    else if (q.get('q')) {
      title = 'Resultados para “' + q.get('q') + '”';
      var norm = function (s) { return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); };
      var term = norm(q.get('q'));
      list = items.filter(function (i) { return norm(i.titulo + ' ' + i.intro + ' ' + temaNome(i.tema)).indexOf(term) > -1; });
    }
    else if (q.get('v') === 'aovivo') {
      cur.v = 'aovivo'; title = 'Transmissões ao Vivo';
      var live = items.filter(function (i) { return i.video.aoVivo; });
      var recent = items.filter(function (i) { return i.transmissao && !i.video.aoVivo; });
      list = live;
      note = live.length ? '' : '<div class="empty">Nenhuma transmissão ao vivo neste momento.</div>';
      extra = recent.length ? '<h2 class="sec">TRANSMISSÕES RECENTES</h2>' + cards(recent) : '';
    }
    else if (q.get('v') === 'acervo') { cur.v = 'acervo'; title = 'Acervo Histórico'; }
    sidebar(cur);
    document.title = title + ' · Cremesp+';
    var main = $('#content');
    main.innerHTML = '<nav class="crumbs" aria-label="Caminho"><a href="index.html">Início</a><span>›</span><b>' + esc(title) + '</b></nav>' +
      '<h1 style="font-size:32px;color:#58595B;margin-bottom:24px">' + esc(title) + '</h1>' +
      (list.length ? cards(list) : (note || '<div class="empty">Nenhum conteúdo publicado nesta seção ainda.</div>')) + extra;
  }

  function pageAdmin() {
    var main = $('#content');
    main.innerHTML =
      '<div class="notice"><b>Demonstração.</b> Este painel não tem login e guarda os cadastros só neste navegador. Na versão final, o acesso é por login e senha de administradores, e os dados ficam em banco de dados com histórico de alterações.</div>' +
      '<h1 style="font-size:30px;margin-bottom:20px">Novo evento</h1>' +
      '<form class="form" id="f" novalidate>' +
      '<section class="box hi"><h2>1. Link do conteúdo (YouTube)</h2><div class="field big"><label for="yt">Cole aqui o link do vídeo ou da transmissão</label>' +
      '<input id="yt" type="url" placeholder="https://www.youtube.com/watch?v=..." autocomplete="off"></div>' +
      '<div class="status" id="ytstat" role="status">Aceitamos links watch?v=, youtu.be/, /live/ e /embed/.</div><div id="ytprev"></div></section>' +
      '<section class="box"><h2>2. Informações da página</h2>' +
      '<div class="field"><label for="tit">Título</label><input id="tit" type="text"></div>' +
      '<div class="row2"><div class="field"><label for="tm">Área temática</label><select id="tm">' + D.temas.map(function (t) { return '<option value="' + t.id + '">' + esc(t.nome) + '</option>'; }).join('') + '</select></div>' +
      '<div class="field"><label for="tp">Tipo de conteúdo</label><select id="tp">' + D.tipos.map(function (t) { return '<option value="' + t.id + '">' + esc(t.singular) + '</option>'; }).join('') + '</select></div>' +
      '<div class="field"><label for="dt">Data</label><input id="dt" type="text" placeholder="dd/mm/aaaa"></div>' +
      '<div class="field"><label for="rz">Identificação institucional</label><input id="rz" type="text" value="CREMESP"></div></div>' +
      '<div class="field"><label for="in">Texto introdutório</label><textarea id="in"></textarea></div>' +
      '<div class="checks"><label><input type="checkbox" id="live">É uma transmissão ao vivo</label></div>' +
      '<div class="field"><label for="st">Status</label><select id="st"><option value="publicado">Publicado</option><option value="rascunho">Rascunho (não aparece no site)</option></select></div></section>' +
      '<div class="actions"><button type="submit" class="btn">Salvar</button></div></form>' +
      '<h2 class="sec">CADASTRADOS NESTE NAVEGADOR</h2><div class="saved" id="saved"></div>' +
      '<h2 class="sec">PARA DEIXAR PERMANENTE</h2><p>Copie o texto abaixo e cole dentro de <code>conteudos</code> no arquivo <code>data.js</code>, depois publique de novo.</p><pre class="out" id="out"></pre>';
    var yt = $('#yt'), stat = $('#ytstat'), prev = $('#ytprev'), cur = null;
    yt.addEventListener('input', function () {
      cur = parseYT(yt.value);
      if (!yt.value.trim()) { stat.className = 'status'; stat.textContent = 'Aceitamos links watch?v=, youtu.be/, /live/ e /embed/.'; prev.innerHTML = ''; return; }
      if (!cur) { stat.className = 'status err'; stat.textContent = 'Link inválido. Use um link do YouTube.'; prev.innerHTML = ''; return; }
      stat.className = 'status ok'; stat.textContent = 'Link válido';
      prev.innerHTML = '<div class="prev"><img src="' + thumb({ id: cur.id }) + '" data-id="' + esc(cur.id) + '" alt="" onerror="__thumbErr(this)"><div><div class="meta">PRÉ-VISUALIZAÇÃO DO VÍDEO</div><b>ID do vídeo: ' + esc(cur.id) + '</b></div></div>';
    });
    function slug(s) { return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70); }
    function refresh() {
      var list = saved();
      $('#saved').innerHTML = list.length ? list.map(function (i, n) {
        return '<div class="saved-row"><span><b>' + esc(i.titulo) + '</b> · ' + (i.status === 'rascunho' ? 'rascunho' : 'publicado') + '</span>' +
          '<a class="btn sm line" href="' + href(i) + '">Ver página</a><button type="button" class="btn sm danger" data-del="' + n + '">Excluir</button></div>';
      }).join('') : '<div class="empty">Nada cadastrado ainda.</div>';
      $('#out').textContent = list.length ? list.map(function (i) { return JSON.stringify(i, null, 2) + ','; }).join('\n') : '(vazio)';
    }
    $('#saved').addEventListener('click', function (e) {
      var b = e.target.closest('[data-del]'); if (!b) return;
      var list = saved(); list.splice(parseInt(b.getAttribute('data-del'), 10), 1); saveList(list); refresh();
    });
    $('#f').addEventListener('submit', function (e) {
      e.preventDefault();
      if (!cur) { stat.className = 'status err'; stat.textContent = 'Cole um link válido do YouTube antes de salvar.'; yt.focus(); return; }
      var titulo = $('#tit').value.trim();
      if (!titulo) { $('#tit').focus(); return; }
      var id = slug(titulo) || cur.id;
      var list = saved();
      if (D.conteudos.concat(list).some(function (i) { return i.id === id; })) id += '-' + Date.now().toString(36).slice(-4);
      var video = { id: cur.id, aoVivo: $('#live').checked };
      if (cur.start) video.start = cur.start;
      list.push({ id: id, titulo: titulo, tipo: $('#tp').value, tema: $('#tm').value, realizacao: $('#rz').value.trim(), data: $('#dt').value.trim(), intro: $('#in').value.trim(), video: video, status: $('#st').value });
      saveList(list); refresh();
      yt.value = ''; $('#tit').value = ''; $('#in').value = ''; $('#dt').value = ''; $('#live').checked = false; cur = null;
      stat.className = 'status ok'; stat.textContent = 'Salvo. Veja em “Cadastrados neste navegador”.'; prev.innerHTML = '';
    });
    refresh();
  }

  /* ---------- início ---------- */
  var page = document.body.getAttribute('data-page');
  $('#content').className = 'content';
  topbar(page);
  if (page === 'home') { sidebar({}); pageHome(); }
  else if (page === 'evento') { pageEvento(); }
  else if (page === 'lista') { pageLista(); }
  else if (page === 'admin') { pageAdmin(); }
})();
