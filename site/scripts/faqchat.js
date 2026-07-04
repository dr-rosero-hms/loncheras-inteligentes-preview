/* faqchat.js · Chat FAQ estilo WhatsApp · MOTOR genérico (marca blanca).
   JavaScript vanilla, autocontenido, sin dependencias, sin backend.

   Configuración: la página define window.FAQCHAT ANTES de cargar este script:

     window.FAQCHAT = {
       chat: {
         status: 'en línea',
         doodle: '/assets/wa-doodle.png',   // '' o ausente = fondo liso #ECE5DD
         intro:  'Hola, soy tu guía. Toca una pregunta y te respondo al instante.',
         boton:  '¿Dudas?'                  // texto visible del botón flotante
       },
       categorias: [
         { label: 'El producto', items: [ { q: '¿...?', a: '...' } ] }
         // ... 5 categorías recomendadas, 8-11 preguntas c/u
       ],
       theme: {
         title:      'NOMBRE DEL PRODUCTO',
         avatar:     '/assets/avatar-marca.png',
         ink:        '#111316',   // chip de categoría activa (fondo) + botón flotante
         inkText:    '#F7F4EC',   // texto sobre ink
         accentSoft: '#E8F8EE',   // chips inactivos y preguntas (fondo)
         accentText: '#1F7A4D'    // chips y preguntas (texto)
       }
     };

   SEGURIDAD (nota del kit, mantener SIEMPRE): la interfaz se arma con innerHTML.
   Es seguro porque (1) TODO string dinámico pasa por esc() antes de insertarse
   y (2) el contenido son constantes de la página, no entrada de usuario.
   Al editar este archivo, nunca interpolar un string sin esc().
   El widget no captura ni envía ningún dato del visitante: no hay campo de texto libre. */

(function () {
  'use strict';

  /* ── Escape HTML: obligatorio en TODO string dinámico ─────── */
  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* URL que va dentro de url('...') en un atributo style: además de esc(),
     se eliminan comillas, paréntesis y backslash para no romper el CSS. */
  function cssUrl(u) {
    return esc(String(u).replace(/["'()\\]/g, ''));
  }

  /* ── Lectura de window.FAQCHAT (definido por la página) ────── */
  var CFG = (typeof window !== 'undefined' && window.FAQCHAT) ? window.FAQCHAT : null;
  if (!CFG) {
    if (typeof console !== 'undefined') console.warn('[faqchat] window.FAQCHAT no está definido antes de cargar faqchat.js; el widget no se monta.');
    return;
  }

  var chatCfg = CFG.chat || {};
  var theme = CFG.theme || {};

  var CHAT = {
    title: String(theme.title || 'Ayuda'),
    status: String(chatCfg.status || 'en línea'),
    avatar: String(theme.avatar || ''),
    doodle: String(chatCfg.doodle || ''),
    intro: String(chatCfg.intro || 'Hola. Toca una pregunta y te respondo al instante.'),
    boton: String(chatCfg.boton || '¿Dudas?'),
    ink: String(theme.ink || '#111316'),
    inkText: String(theme.inkText || '#F7F4EC'),
    accentSoft: String(theme.accentSoft || '#E8F8EE'),
    accentText: String(theme.accentText || '#1F7A4D')
  };

  var HELP_DATA = Array.isArray(CFG.categorias)
    ? CFG.categorias.filter(function (c) { return c && c.label && Array.isArray(c.items) && c.items.length > 0; })
    : [];

  if (!HELP_DATA.length) {
    if (typeof console !== 'undefined') console.warn('[faqchat] window.FAQCHAT.categorias está vacío; el widget no se monta.');
    return;
  }

  /* ── Avatar: img del cliente, o inicial del título si no hay ─ */
  function avatarHtml(px) {
    if (CHAT.avatar) {
      return '<img src="' + esc(CHAT.avatar) + '" alt="" style="width: ' + px + 'px; height: ' + px + 'px; object-fit: contain;" />';
    }
    var initial = (CHAT.title.trim().charAt(0) || '?').toUpperCase();
    return '<span aria-hidden="true" style="font-size: ' + Math.round(px * 0.62) + 'px; font-weight: 700; line-height: 1; color: ' + esc(CHAT.accentText) + ';">' + esc(initial) + '</span>';
  }

  /* ── Botón flotante: lo crea el propio script ───────────────
     Accesibilidad (auditoría Lighthouse): el aria-label ES el texto
     visible del botón, y el avatar interno lleva alt="" (decorativo). */
  function createButton() {
    var existing = document.getElementById('faq-chat-btn');
    if (existing) return existing;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'faq-chat-btn';
    btn.setAttribute('aria-label', CHAT.boton);
    btn.style.cssText = 'position: fixed; left: 22px; bottom: 22px; z-index: 255; display: inline-flex; align-items: center; gap: 10px; background: ' + CHAT.ink + '; color: ' + CHAT.inkText + '; border: 1px solid rgba(0,0,0,0.22); border-radius: 999px; padding: 11px 18px 11px 12px; cursor: pointer; box-shadow: 0 12px 32px rgba(0,0,0,0.28); font-family: inherit; font-weight: 600; font-size: 14px;';
    btn.innerHTML = '<span style="width: 30px; height: 30px; border-radius: 50%; background: ' + esc(CHAT.accentSoft) + '; display: flex; align-items: center; justify-content: center; flex: none; overflow: hidden;">' + avatarHtml(20) + '</span>' + esc(CHAT.boton);
    document.body.appendChild(btn);
    return btn;
  }

  /* ── Widget (conversión fiel de faqchat.ts del kit) ─────────── */
  function initFaqChat(deps) {
    var btn = deps.helpBtn;
    if (!btn) return;

    var open = false;
    var cat = 0;
    var thread = []; // { id, q, a, typing }
    var panel = null;

    function catChipsHtml() {
      return HELP_DATA.map(function (c, i) {
        var style = 'flex: none; cursor: pointer; border: none; border-radius: 999px; padding: 10px 14px; font-family: inherit; font-size: 12.5px; font-weight: 600; white-space: nowrap; transition: all 150ms; background: ' + esc(i === cat ? CHAT.ink : CHAT.accentSoft) + '; color: ' + esc(i === cat ? CHAT.inkText : CHAT.accentText) + ';';
        return '<button type="button" data-cat="' + i + '" style="' + style + '">' + esc(c.label) + '</button>';
      }).join('');
    }

    function chipsHtml() {
      var items = HELP_DATA[cat] ? HELP_DATA[cat].items : [];
      return items
        .map(function (it, i) {
          return '<button type="button" data-chip="' + i + '" style="text-align: left; cursor: pointer; background: ' + esc(CHAT.accentSoft) + '; border: 1px solid transparent; border-radius: 10px; padding: 13px 14px; font-family: inherit; font-size: 13.5px; font-weight: 500; color: ' + esc(CHAT.accentText) + '; transition: all 140ms;">' + esc(it.q) + '</button>';
        })
        .join('');
    }

    function threadHtml() {
      /* Detalles que hacen que se sienta real (sección 5 del kit, no quitar):
         colas de burbuja con borders, hora fija 9:41, checks azules SOLO en
         la burbuja del visitante, animación con rebote suave. */
      var intro = '<div style="position: relative; align-self: flex-start; max-width: 85%; background: #fff; border-radius: 0 7px 7px 7px; padding: 6px 9px 8px; font-size: 13.5px; line-height: 1.45; color: #111b21; box-shadow: 0 1px 0.6px rgba(0,0,0,0.13);">' +
        '<span style="position: absolute; top: 0; left: -7px; width: 0; height: 0; border-style: solid; border-width: 0 7px 8px 0; border-color: transparent #fff transparent transparent;"></span>' +
        esc(CHAT.intro) +
        '<span style="float: right; font-size: 10px; color: #667781; margin: 6px 0 -2px 10px;">9:41</span>' +
        '</div>';
      var msgs = thread
        .map(function (m) {
          var ask = '<div style="position: relative; align-self: flex-end; max-width: 85%; background: #D9FDD3; border-radius: 7px 0 7px 7px; padding: 6px 9px 8px; font-size: 13.5px; line-height: 1.45; color: #111b21; box-shadow: 0 1px 0.6px rgba(0,0,0,0.13); animation: faq-msg-in 300ms cubic-bezier(.34,1.4,.5,1) both;">' +
            '<span style="position: absolute; top: 0; right: -7px; width: 0; height: 0; border-style: solid; border-width: 0 0 8px 7px; border-color: transparent transparent transparent #D9FDD3;"></span>' +
            esc(m.q) +
            '<span style="float: right; font-size: 10px; color: #667781; margin: 6px 0 -2px 10px; white-space: nowrap;">9:41 <span style="color: #53BDEB; letter-spacing: -3px; font-size: 12px;">✓✓</span></span>' +
            '</div>';
          var typing = m.typing
            ? '<div style="position: relative; align-self: flex-start; display: inline-flex; align-items: center; gap: 5px; background: #fff; border-radius: 0 7px 7px 7px; padding: 12px 14px; box-shadow: 0 1px 0.6px rgba(0,0,0,0.13); animation: faq-msg-in 200ms ease both;">' +
              '<span style="position: absolute; top: 0; left: -7px; width: 0; height: 0; border-style: solid; border-width: 0 7px 8px 0; border-color: transparent #fff transparent transparent;"></span>' +
              '<span style="width: 7px; height: 7px; border-radius: 50%; background: #9aa0a6; animation: faq-dot-bounce 1.3s infinite ease-in-out;"></span>' +
              '<span style="width: 7px; height: 7px; border-radius: 50%; background: #9aa0a6; animation: faq-dot-bounce 1.3s infinite ease-in-out 0.18s;"></span>' +
              '<span style="width: 7px; height: 7px; border-radius: 50%; background: #9aa0a6; animation: faq-dot-bounce 1.3s infinite ease-in-out 0.36s;"></span>' +
              '</div>'
            : '';
          var answer = !m.typing
            ? '<div style="position: relative; align-self: flex-start; max-width: 85%; background: #fff; border-radius: 0 7px 7px 7px; padding: 6px 9px 8px; font-size: 13.5px; line-height: 1.5; color: #111b21; box-shadow: 0 1px 0.6px rgba(0,0,0,0.13); animation: faq-msg-in 340ms cubic-bezier(.34,1.4,.5,1) both;">' +
              '<span style="position: absolute; top: 0; left: -7px; width: 0; height: 0; border-style: solid; border-width: 0 7px 8px 0; border-color: transparent #fff transparent transparent;"></span>' +
              esc(m.a) +
              '<span style="float: right; font-size: 10px; color: #667781; margin: 6px 0 -2px 10px;">9:41</span>' +
              '</div>'
            : '';
          return ask + typing + answer;
        })
        .join('');
      return intro + msgs;
    }

    function panelHtml() {
      var bg = CHAT.doodle
        ? "background-color: #ECE5DD; background-image: url('" + cssUrl(CHAT.doodle) + "'); background-size: 420px auto;"
        : 'background-color: #ECE5DD;';
      return '' +
        '<div style="background: #075E54; color: #fff; padding: 11px 14px; display: flex; align-items: center; gap: 11px; flex: none;">' +
        '<span style="width: 38px; height: 38px; border-radius: 50%; background: #fff; display: flex; align-items: center; justify-content: center; flex: none; overflow: hidden;">' +
        avatarHtml(26) +
        '</span>' +
        '<div style="flex: 1; min-width: 0;">' +
        '<div style="font-size: 15px; font-weight: 600; line-height: 1.15;">' + esc(CHAT.title) + '</div>' +
        '<div style="font-size: 12px; color: #cfeee6; margin-top: 1px;">' + esc(CHAT.status) + '</div>' +
        '</div>' +
        '<button type="button" data-close aria-label="Cerrar" style="flex: none; background: none; border: none; color: #fff; font-size: 22px; line-height: 1; cursor: pointer; padding: 0 4px;">×</button>' +
        '</div>' +
        '<div id="faq-chat-thread" style="flex: 1; min-height: 0; overflow-y: auto; padding: 14px 14px 18px; display: flex; flex-direction: column; gap: 8px; ' + bg + '">' +
        threadHtml() +
        '</div>' +
        '<div style="flex: none; border-top: 1px solid #d4d4d4; background: #F0F2F5;">' +
        '<div style="display: flex; gap: 6px; padding: 11px 12px 4px; overflow-x: auto;" data-cats>' + catChipsHtml() + '</div>' +
        '<div style="display: flex; flex-direction: column; gap: 6px; padding: 8px 12px 14px; max-height: 168px; overflow-y: auto;" data-chips>' + chipsHtml() + '</div>' +
        '</div>';
    }

    function scrollThread() {
      var t = panel ? panel.querySelector('#faq-chat-thread') : null;
      if (t) t.scrollTop = t.scrollHeight;
    }
    function renderThread() {
      var t = panel ? panel.querySelector('#faq-chat-thread') : null;
      if (t) { t.innerHTML = threadHtml(); scrollThread(); }
    }
    function renderChips() {
      var c = panel ? panel.querySelector('[data-chips]') : null;
      var cats = panel ? panel.querySelector('[data-cats]') : null;
      if (c) c.innerHTML = chipsHtml();
      if (cats) cats.innerHTML = catChipsHtml();
      bindLists();
    }

    function ask(it) {
      var id = 'm' + Date.now() + Math.round(Math.random() * 1000);
      thread.push({ id: id, q: it.q, a: it.a, typing: true });
      renderThread();
      setTimeout(scrollThread, 60);
      // Delay de "escribiendo" proporcional al largo de la respuesta (tope 850 ms).
      // Instantáneo se siente robótico; fijo se siente falso. No quitar.
      var delay = Math.min(850, 380 + String(it.a).length * 4);
      setTimeout(function () {
        var m = null;
        for (var i = 0; i < thread.length; i++) { if (thread[i].id === id) { m = thread[i]; break; } }
        if (m) m.typing = false;
        renderThread();
      }, delay);
    }

    function bindLists() {
      if (!panel) return;
      panel.querySelectorAll('[data-cat]').forEach(function (el) {
        el.addEventListener('click', function () { cat = Number(el.dataset.cat); renderChips(); });
      });
      panel.querySelectorAll('[data-chip]').forEach(function (el) {
        el.addEventListener('click', function () {
          var items = HELP_DATA[cat] ? HELP_DATA[cat].items : [];
          var it = items[Number(el.dataset.chip)];
          if (it) ask(it);
        });
      });
    }

    function openPanel() {
      if (panel) return;
      panel = document.createElement('div');
      panel.id = 'faq-chat-panel';
      panel.style.cssText = 'position: fixed; left: 22px; bottom: 90px; z-index: 260; width: 372px; max-width: calc(100vw - 44px); height: 70vh; max-height: 560px; display: flex; flex-direction: column; background: #fff; border: 1px solid #e4e2dd; border-radius: 16px; box-shadow: 0 18px 50px rgba(0,0,0,0.28); overflow: hidden;';
      panel.innerHTML = panelHtml();
      document.body.appendChild(panel);
      var close = panel.querySelector('[data-close]');
      if (close) close.addEventListener('click', function () { closePanel(); });
      bindLists();
      scrollThread();
    }
    function closePanel() {
      if (panel) { panel.remove(); panel = null; }
      open = false;
    }

    btn.addEventListener('click', function () {
      open = !open;
      if (open) openPanel();
      else closePanel();
    });
  }

  /* ── Montaje ────────────────────────────────────────────────── */
  function mount() {
    initFaqChat({ helpBtn: createButton() });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
