
const KEY = 'personal-vocab-v1';

const languages = {
  ja: '일본어',
  en: '영어',
  zh: '중국어'
};

const samples = [
  {
    id: 'sample1',
    lang: 'ja',
    term: '浴びます',
    reading: 'あびます',
    meaning: '샤워하다, 물을 끼얹다',
    example: 'シャワーを浴びます。',
    translation: '샤워를 합니다.',
    note: '',
    due: 0,
    interval: 0,
    correct: 0,
    wrong: 0
  },
  {
    id: 'sample2',
    lang: 'ja',
    term: 'どんな',
    reading: 'どんな',
    meaning: '어떤 종류의',
    example: 'どんな映画が好きですか。',
    translation: '어떤 영화를 좋아하세요?',
    note: '',
    due: 0,
    interval: 0,
    correct: 0,
    wrong: 0
  }
];

const app = document.getElementById('app');

let words = [];
let lang = 'ja';
let tab = 'list';
let search = '';
let deck = [];
let position = 0;
let flipped = false;
let studyMode = 'due';
let draftExamples = [];
let editingId = null;
let showRuby = localStorage.getItem('vocab-show-ruby') !== 'off';
let slowSpeech = localStorage.getItem('vocab-slow-speech') === 'on';

const esc = value => String(value ?? '').replace(
  /[&<>"']/g,
  c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c])
);

const uid = () =>
  globalThis.crypto?.randomUUID?.() ??
  String(Date.now() + Math.random());

function normalizeExample(item) {
  if (typeof item === 'string') {
    return {
      text: item,
      translation: '',
      type: '',
      ruby: ''
    };
  }

  return {
    text: String(item?.text ?? ''),
    translation: String(item?.translation ?? ''),
    type: String(item?.type ?? ''),
    ruby: String(item?.ruby ?? '')
  };
}

function getExamples(word) {
  if (Array.isArray(word.examples)) {
    return word.examples.map(normalizeExample);
  }

  if (word.example) {
    return [{
      text: String(word.example),
      translation: String(word.translation || ''),
      type: ''
    }];
  }

  return [];
}

function normalizeWord(word) {
  return {
    ...word,
    examples: getExamples(word)
  };
}

try {
  const saved = JSON.parse(localStorage.getItem(KEY));

  words = (
    Array.isArray(saved)
      ? saved
      : samples
  ).map(normalizeWord);
} catch {
  words = samples.map(normalizeWord);
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(words));
    return true;
  } catch {
    alert('저장하지 못했어. 저장 공간을 확인해 줘.');
    return false;
  }
}

function toast(message) {
  const el = document.getElementById('toast');
  if (!el) return;

  el.textContent = message;
  el.style.display = 'block';

  clearTimeout(toast.timer);

  toast.timer = setTimeout(() => {
    el.style.display = 'none';
  }, 2400);
}

// 읽기 표기: 水[みず], 每[měi] 형태를 안전한 ruby HTML로 변환.
function rubyHTML(markup, fallback) {
  if (!showRuby || !markup?.trim()) return esc(fallback);
  const pattern = /([^\[\]\s]+)\[([^\[\]]+)\]/g;
  let result = '';
  let last = 0;
  for (const match of markup.matchAll(pattern)) {
    result += esc(markup.slice(last, match.index));
    result += `<ruby>${esc(match[1])}<rt>${esc(match[2])}</rt></ruby>`;
    last = match.index + match[0].length;
  }
  result += esc(markup.slice(last));
  return result;
}

// 단어 표기: 직접 입력한 漢字[かな] 표기를 우선 사용한다.
// 한자 1개 + 가나 어미인 경우에만 전체 읽기에서 안전하게 분리한다.
function headwordHTML(word) {
  const term = String(word.term || '');
  const reading = String(word.reading || '');
  if (!showRuby || word.lang === 'en') return esc(term);
  if (/[^\[\]]+\[[^\[\]]+\]/.test(term)) {
    return rubyHTML(term, term.replace(/\[([^\]]+)\]/g, ''));
  }
  if (word.lang === 'ja') {
    const match = term.match(/^([\u3400-\u9fff])([\u3040-\u309f\u30a0-\u30ff]+)$/u);
    if (match && reading.endsWith(match[2]) && reading.length > match[2].length) {
      const root = reading.slice(0, -match[2].length);
      return `<ruby>${esc(match[1])}<rt>${esc(root)}</rt></ruby>${esc(match[2])}`;
    }
  }
  return esc(term);
}

// 단어나 예문을 짧게 탭하면 브라우저 기본 음성으로 읽어 줌.
function speakableHTML(html, text, language, label = '발음 듣기') {
  if (!String(text || '').trim()) return html;
  return `<span class="tap-to-speak" style="cursor:pointer;touch-action:manipulation" role="button" tabindex="0" data-speak="${esc(text)}" data-speak-lang="${esc(language)}" aria-label="${esc(label)}">${html}</span>`;
}

function bindSpeech() {
  document.querySelectorAll('[data-speak]').forEach(element => {
    const play = event => {
      event.stopPropagation();
      if (!('speechSynthesis' in window)) {
        toast('이 브라우저는 음성 재생을 지원하지 않아.');
        return;
      }
      const utterance = new SpeechSynthesisUtterance(element.dataset.speak);
      utterance.lang = ({ ja: 'ja-JP', zh: 'zh-CN', en: 'en-US' })[element.dataset.speakLang] || 'ja-JP';
      utterance.rate = slowSpeech ? 0.75 : 1;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    };
    element.addEventListener('click', play);
    element.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        play(event);
      }
    });
  });
}

function readingControls() {
  return `<div style="display:flex;align-items:center;flex-wrap:wrap;gap:10px 18px;margin:10px 0 14px">
    <label style="display:inline-flex;align-items:center;gap:6px;white-space:nowrap;width:auto;font-size:13px;cursor:pointer"><input type="checkbox" id="rubyToggle" style="width:17px;height:17px;min-width:17px;margin:0;padding:0;flex:none;accent-color:#263a69" ${showRuby ? 'checked' : ''}> 후리가나·병음</label>
    <label style="display:inline-flex;align-items:center;gap:6px;white-space:nowrap;width:auto;font-size:13px;cursor:pointer"><input type="checkbox" id="slowToggle" style="width:17px;height:17px;min-width:17px;margin:0;padding:0;flex:none;accent-color:#263a69" ${slowSpeech ? 'checked' : ''}> 느리게 듣기</label>
  </div>`;
}

function bindReadingControls() {
  const ruby = document.getElementById('rubyToggle');
  const slow = document.getElementById('slowToggle');
  if (ruby) ruby.onchange = () => {
    showRuby = ruby.checked;
    localStorage.setItem('vocab-show-ruby', showRuby ? 'on' : 'off');
    render();
  };
  if (slow) slow.onchange = () => {
    slowSpeech = slow.checked;
    localStorage.setItem('vocab-slow-speech', slowSpeech ? 'on' : 'off');
  };
}

function examplesHTML(word) {
  const examples = getExamples(word);

  if (!examples.length) return '';

  return examples.map((ex, index) => `
    <div class="note" style="
      margin-top:10px;
      padding:10px;
      border-radius:10px;
      background:#f3f6fc;
    ">
      <small>
        예문 ${index + 1}
        ${ex.type ? ' · ' + esc(ex.type) : ''}
      </small>

      <p style="margin:6px 0">
        ${speakableHTML(rubyHTML(ex.ruby, ex.text), ex.text, word.lang, '예문을 눌러 발음 듣기')}
      </p>

      <p class="muted" style="margin:0">
        ${esc(ex.translation)}
      </p>
    </div>
  `).join('');
}

// 플래시카드 전용 예문: 목록용 예문 레이아웃과 분리
function studyExamplesHTML(word) {
  const examples = getExamples(word);
  if (!examples.length) return '';
  return examples.map((ex, index) => `
    <div style="display:block;position:relative;box-sizing:border-box;width:100%;height:auto;min-height:0;margin:0 0 10px;padding:14px;border-radius:12px;background:#f3f6fc;text-align:left;">
      <small style="display:block;margin:0 0 10px;padding-right:155px;color:#6b7588;">예문 ${index + 1}${ex.type ? ' · ' + esc(ex.type) : ''}</small>
      ${speakableHTML('<small style="display:block;position:absolute;top:14px;right:14px;font-size:12px;font-weight:400;color:#8a93a5;text-align:right;">🔊 터치하여 발음 듣기</small>', ex.text, word.lang, '예문 발음 듣기')}
      <div style="display:block;height:auto;min-height:0;margin:0;padding:0;line-height:1.65;font-size:17px;text-align:center;">
        <span style="display:inline-block;text-align:center;">${speakableHTML(rubyHTML(ex.ruby, ex.text), ex.text, word.lang, '예문을 눌러 발음 듣기')}</span>
      </div>
      <div style="display:block;height:auto;min-height:0;margin:8px 0 0;padding:0;line-height:1.55;color:#6b7588;font-size:15px;text-align:center;">${esc(ex.translation)}</div>
    </div>
  `).join('');
}

function layout(content) {
  app.innerHTML = `
    <main>
      <header>
        <div>
          <h1>나의 단어장</h1>
          <small>영어 · 일본어 · 중국어</small>
        </div>
        <span class="pill">개인용</span>
      </header>

      <nav class="tabs">
        ${[
          ['list', '단어장'],
          ['add', '단어 등록'],
          ['study', '플래시카드'],
          ['data', 'CSV 관리']
        ].map(([id, name]) => `
          <button
            class="${tab === id ? 'active' : ''}"
            data-tab="${id}"
          >${name}</button>
        `).join('')}
      </nav>

      <div class="panel">
        <div class="row">
          <label for="language">언어</label>

          <select id="language" class="grow">
            ${Object.entries(languages).map(([k, v]) => `
              <option
                value="${k}"
                ${k === lang ? 'selected' : ''}
              >${v}</option>
            `).join('')}
          </select>
        </div>
      </div>

      ${readingControls()}
      ${content}
    </main>

    <div id="toast" role="status"></div>
  `;

  bindReadingControls();
  bindSpeech();

  document.querySelectorAll('[data-tab]').forEach(b => {
    b.onclick = () => {
      editingId = null;
      draftExamples = [];
      tab = b.dataset.tab;

      if (tab === 'study') {
        startDeck();
      }

      render();
    };
  });

  document.getElementById('language').onchange = e => {
    lang = e.target.value;
    search = '';
    editingId = null;
    draftExamples = [];

    if (tab === 'study') {
      startDeck();
    }

    render();
  };
}

function render() {
  if (tab === 'add') return renderAdd();
  if (tab === 'study') return renderStudy();
  if (tab === 'data') return renderData();

  renderList();
}

// -------------------------------
// 단어 목록과 실시간 검색
// -------------------------------

function filteredWords() {
  const keyword = search.toLowerCase();

  return words.filter(w =>
    w.lang === lang &&
    [
      w.term,
      w.reading,
      w.meaning,
      w.note,
      ...getExamples(w).flatMap(ex => [
        ex.text,
        ex.translation,
        ex.type
      ])
    ].some(value =>
      String(value || '')
        .toLowerCase()
        .includes(keyword)
    )
  );
}

function updateSearchResults() {
  const results = document.getElementById('results');
  if (!results) return;

  const filtered = filteredWords();

  results.innerHTML = filtered.length
    ? filtered.map(w => `
      <div class="word">
        <div class="grow">
          <strong>${speakableHTML(esc(w.term), w.reading && w.lang === 'ja' ? w.reading : w.term, w.lang, '단어를 눌러 발음 듣기')}</strong>
          <small>${esc(w.reading)}</small>

          <p>${esc(w.meaning)}</p>

          ${examplesHTML(w)}

          ${w.note ? `
            <p class="note muted">
              ${esc(w.note)}
            </p>
          ` : ''}
        </div>

        <div style="
          display:flex;
          flex-direction:column;
          gap:6px;
        ">
          <button
            class="secondary"
            data-edit="${esc(w.id)}"
          >수정</button>

          <button
            class="danger"
            data-del="${esc(w.id)}"
          >삭제</button>
        </div>
      </div>
    `).join('')
    : '<p class="muted">검색 결과가 없어.</p>';

  bindSpeech();

  results.querySelectorAll('[data-edit]').forEach(b => {
    b.onclick = () => {
      const w = words.find(
        item => item.id === b.dataset.edit
      );

      if (!w) return;

      editingId = w.id;

      draftExamples = getExamples(w).map(
        ex => ({ ...ex })
      );

      tab = 'add';
      render();
    };
  });

  results.querySelectorAll('[data-del]').forEach(b => {
    b.onclick = () => {
      if (!confirm('이 단어를 삭제할까?')) return;

      const previous = words;

      words = words.filter(
        w => w.id !== b.dataset.del
      );

      if (!save()) {
        words = previous;
        return;
      }

      renderList();
      toast('단어를 삭제했어.');
    };
  });
}

function renderList() {
  const total = words.filter(w => w.lang === lang);

  const due = total.filter(
    w => !w.due || w.due <= Date.now()
  ).length;

  layout(`
    <section class="stats">
      <div class="stat">
        <small>등록 단어</small>
        <b>${total.length}</b>
      </div>

      <div class="stat">
        <small>복습할 단어</small>
        <b>${due}</b>
      </div>
    </section>

    <section class="panel">
      <h2>단어 검색</h2>

      <input
        id="search"
        type="search"
        placeholder="단어·뜻·예문·메모 검색"
        value="${esc(search)}"
        autocomplete="off"
      >

      <div id="results"></div>
    </section>

    <p class="note muted">
      단어는 현재 브라우저에 저장돼.
      중요한 단어는 CSV로 백업해 줘.
    </p>
  `);

  const input = document.getElementById('search');

  input.addEventListener('input', e => {
    search = e.target.value;

    if (!e.isComposing) {
      updateSearchResults();
    }
  });

  input.addEventListener('compositionend', e => {
    search = e.target.value;
    updateSearchResults();
  });

  input.addEventListener('search', e => {
    search = e.target.value;
    updateSearchResults();
  });

  updateSearchResults();
}

// -------------------------------
// 예문 추가 및 편집
// -------------------------------

function collectExampleDraft() {
  const text = document.getElementById('exText');
  const translation = document.getElementById('exTranslation');
  const type = document.getElementById('exType');
  const ruby = document.getElementById('exRuby');

  if (!text) return false;

  const value = text.value.trim();

  if (!value) {
    toast('예문을 먼저 입력해 줘.');
    return false;
  }

  draftExamples.push({
    text: value,
    translation: translation.value.trim(),
    type: type.value.trim(),
    ruby: ruby.value.trim()
  });

  text.value = '';
  translation.value = '';
  type.value = '';
  ruby.value = '';

  updateDraftExamples();
  return true;
}

function syncDraftExamples() {
  document.querySelectorAll(
    '[data-example-index]'
  ).forEach(input => {
    const index = Number(
      input.dataset.exampleIndex
    );

    const field = input.dataset.exampleField;

    if (
      draftExamples[index] &&
      ['text', 'translation', 'type', 'ruby'].includes(field)
    ) {
      draftExamples[index][field] = input.value;
    }
  });
}

function updateDraftExamples() {
  const list = document.getElementById('draftList');
  if (!list) return;

  list.innerHTML = draftExamples.length
    ? draftExamples.map((ex, index) => `
      <div class="panel" style="margin:8px 0">
        <div class="fields">
          <div class="row">
            <strong class="grow">
              예문 ${index + 1}
            </strong>

            <button
              type="button"
              class="danger"
              data-remove-example="${index}"
            >삭제</button>
          </div>

          <label>
            <small>외국어 예문</small>
            <textarea
              data-example-index="${index}"
              data-example-field="text"
              rows="2"
              style="
                width:100%;
                border:1px solid #d7deea;
                border-radius:11px;
                padding:12px;
                font:inherit;
              "
            >${esc(ex.text)}</textarea>
          </label>

          <label>
            <small>읽는 법 표시 (선택 · 예: 水[みず]を飲[の]みます。)</small>
            <textarea data-example-index="${index}" data-example-field="ruby" rows="2" style="width:100%;border:1px solid #d7deea;border-radius:11px;padding:12px;font:inherit">${esc(ex.ruby || '')}</textarea>
          </label>

          <label>
            <small>한국어 해석</small>
            <textarea
              data-example-index="${index}"
              data-example-field="translation"
              rows="2"
              style="
                width:100%;
                border:1px solid #d7deea;
                border-radius:11px;
                padding:12px;
                font:inherit;
              "
            >${esc(ex.translation)}</textarea>
          </label>

          <label>
            <small>예문 유형</small>
            <input
              data-example-index="${index}"
              data-example-field="type"
              value="${esc(ex.type)}"
              placeholder="회화 · TOEIC · JLPT · HSK"
            >
          </label>
        </div>
      </div>
    `).join('')
    : '<p class="muted note">추가된 예문이 없어.</p>';

  list.querySelectorAll(
    '[data-example-index]'
  ).forEach(input => {
    input.addEventListener('input', () => {
      syncDraftExamples();
    });
  });

  list.querySelectorAll(
    '[data-remove-example]'
  ).forEach(button => {
    button.onclick = () => {
      syncDraftExamples();

      draftExamples.splice(
        Number(button.dataset.removeExample),
        1
      );

      updateDraftExamples();
    };
  });
}

// -------------------------------
// 단어 등록 및 수정
// -------------------------------

function renderAdd() {
  const existing = editingId
    ? words.find(w => w.id === editingId)
    : null;

  if (editingId && !existing) {
    editingId = null;
    draftExamples = [];
  }

  const w = existing || {};

  layout(`
    <section class="panel">
      <h2>
        ${existing ? '단어 수정' : '새 단어 등록'}
      </h2>

      <form id="wordForm" class="fields">
        <label>
          <small>단어</small>
          <input
            name="term"
            placeholder="단어 (필수)"
            value="${esc(w.term)}"
            required
          >
        </label>

        <label>
          <small>읽는 법</small>
          <input
            name="reading"
            placeholder="히라가나·병음 등"
            value="${esc(w.reading)}"
          >
        </label>

        <label>
          <small>한국어 뜻</small>
          <input
            name="meaning"
            placeholder="한국어 뜻 (필수)"
            value="${esc(w.meaning)}"
            required
          >
        </label>

        <label>
          <small>메모</small>
          <input
            name="note"
            placeholder="메모 (선택)"
            value="${esc(w.note)}"
          >
        </label>

        <div style="margin-top:10px">
          <h2>예문</h2>
          <p class="note muted">
            기존 예문을 직접 수정하거나
            새 예문을 추가할 수 있어.
          </p>
        </div>

        <div id="draftList"></div>

        <h2>새 예문 추가</h2>

        <textarea
          id="exText"
          placeholder="외국어 예문"
          rows="2"
          style="
            width:100%;
            border:1px solid #d7deea;
            border-radius:11px;
            padding:12px;
            font:inherit;
          "
        ></textarea>

        <textarea id="exRuby" placeholder="읽는 법 표시 (선택): 水[みず]を飲[の]みます。 / 我[wǒ]喝[hē]水[shuǐ]。" rows="2" style="width:100%;border:1px solid #d7deea;border-radius:11px;padding:12px;font:inherit"></textarea>

        <textarea
          id="exTranslation"
          placeholder="예문 한국어 해석"
          rows="2"
          style="
            width:100%;
            border:1px solid #d7deea;
            border-radius:11px;
            padding:12px;
            font:inherit;
          "
        ></textarea>

        <input
          id="exType"
          placeholder="예문 유형 (선택)"
        >

        <button
          type="button"
          class="secondary"
          id="addExample"
        >+ 예문 추가</button>

        <button type="submit">
          ${existing
            ? '수정 내용 저장'
            : '단어 저장'}
        </button>

        ${existing ? `
          <button
            type="button"
            class="secondary"
            id="cancelEdit"
          >수정 취소</button>
        ` : ''}
      </form>
    </section>
  `);

  updateDraftExamples();

  document.getElementById('addExample').onclick = () => {
    syncDraftExamples();
    collectExampleDraft();
  };

  if (existing) {
    document.getElementById('cancelEdit').onclick = () => {
      editingId = null;
      draftExamples = [];
      tab = 'list';
      render();
    };
  }

  document.getElementById('wordForm').onsubmit = e => {
    e.preventDefault();

    syncDraftExamples();

    const data = Object.fromEntries(
      new FormData(e.target)
    );

    const term = data.term.trim();
    const meaning = data.meaning.trim();

    if (!term || !meaning) return;

    if (words.some(w =>
      w.lang === lang &&
      w.term === term &&
      w.id !== editingId
    )) {
      alert('이미 등록된 단어야.');
      return;
    }

    const pendingText = document
      .getElementById('exText')
      .value.trim();

    if (pendingText) {
      collectExampleDraft();
    }

    const changes = {
      term,
      reading: data.reading.trim(),
      meaning,
      note: data.note.trim(),
      examples: draftExamples
        .map(ex => ({
          text: ex.text.trim(),
          translation: ex.translation.trim(),
          type: ex.type.trim(),
          ruby: (ex.ruby || '').trim()
        }))
        .filter(ex => ex.text)
    };

    if (existing) {
      const previous = { ...existing };

      Object.assign(existing, changes);

      if (!save()) {
        Object.assign(existing, previous);
        return;
      }
    } else {
      const item = {
        id: uid(),
        lang,
        ...changes,
        due: 0,
        interval: 0,
        correct: 0,
        wrong: 0
      };

      words.unshift(item);

      if (!save()) {
        words.shift();
        return;
      }
    }

    const message = existing
      ? '수정 내용을 저장했어.'
      : '단어를 저장했어.';

    editingId = null;
    draftExamples = [];
    search = '';
    tab = 'list';

    render();
    toast(message);
  };
}

// -------------------------------
// 플래시카드 및 복습
// -------------------------------

function startDeck() {
  deck = words
    .filter(w =>
      w.lang === lang &&
      (studyMode === 'all' || !w.due || w.due <= Date.now())
    )
    .map(w => w.id);

  position = 0;
  flipped = false;
}

function studyModeButtons() {
  return `<div class="study-modes" role="group" aria-label="복습 방식">
    <button class="${studyMode === 'due' ? 'active' : 'secondary'}" id="modeDue">오늘의 복습</button>
    <button class="${studyMode === 'all' ? 'active' : 'secondary'}" id="modeAll">전체 단어 복습</button>
  </div>`;
}

function bindStudyModes() {
  document.getElementById('modeDue')?.addEventListener('click', () => {
    studyMode = 'due'; startDeck(); renderStudy();
  });
  document.getElementById('modeAll')?.addEventListener('click', () => {
    studyMode = 'all'; startDeck(); renderStudy();
  });
}

function renderStudy() {
  if (
    deck.some(id => !words.find(w => w.id === id))
  ) {
    startDeck();
  }

  if (position >= deck.length && deck.length) {
    layout(`
      <section class="panel">
        ${studyModeButtons()}
        <h2>${studyMode === 'all' ? '전체 단어 복습 완료!' : '오늘 복습 완료!'}</h2>
        <p>복습할 단어를 모두 확인했어.</p>
        <button id="again">다시 확인</button>
      </section>
    `);

    document.getElementById('again').onclick = () => {
      startDeck();
      renderStudy();
    };
    bindStudyModes();

    return;
  }

  if (!deck.length) {
    layout(`
      <section class="panel">
        ${studyModeButtons()}
        <h2>${studyMode === 'all' ? '등록된 단어가 없어' : '복습할 단어가 없어'}</h2>
        <p>
          ${studyMode === 'all' ? '새 단어를 등록해 줘.' : '전체 단어 복습을 누르면 언제든 다시 공부할 수 있어.'}
        </p>
      </section>
    `);
    bindStudyModes();

    return;
  }

  const w = words.find(
    item => item.id === deck[position]
  );

  if (!w) {
    startDeck();
    render();
    return;
  }

  layout(`
    <section class="panel">
      ${studyModeButtons()}
      <div class="row">
        <h2 class="grow">플래시카드</h2>
        <small>
          ${position + 1} / ${deck.length}
        </small>
      </div>

      <div class="card study-card ${flipped ? 'is-back' : 'is-front'}" id="flip" role="button" tabindex="0" aria-label="플래시카드 뒤집기">
        ${flipped ? `
          <div class="study-back-content">
            <div class="study-meaning">${esc(w.meaning)}</div>
            <div class="study-examples" style="display:block;flex:none;height:auto;min-height:0;">${studyExamplesHTML(w)}</div>
            ${w.note ? `<p class="study-extra-note muted">${esc(w.note)}</p>` : ''}
          </div>
        ` : `
          <div class="study-front-content">
            <div class="study-headword">${headwordHTML(w)}</div>
          </div>
        `}
        ${!flipped ? '<small class="study-flip-help">카드를 눌러 뒤집기</small>' : ''}
      </div>

      <div class="row" style="margin-top:15px">
        <button
          class="secondary grow"
          id="wrong"
        >다시 복습</button>

        <button
          class="grow"
          id="right"
        >알고 있어</button>
      </div>
    </section>
  `);

  bindSpeech();
  bindStudyModes();

  const flip = () => {
    const turningToBack = !flipped;
    flipped = turningToBack;
    // iPad Safari: 음성 재생은 카드 터치/키보드 동작 중에 직접 시작한다.
    if (turningToBack && 'speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(w.reading || w.term);
      utterance.lang = ({ ja: 'ja-JP', zh: 'zh-CN', en: 'en-US' })[w.lang] || 'ja-JP';
      utterance.rate = slowSpeech ? 0.75 : 1;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    }
    renderStudy();
  };

  document.getElementById('flip').onclick = flip;

  document.getElementById('flip').onkeydown = e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      flip();
    }
  };

  document.getElementById('wrong').onclick = () => {
    rate(false);
  };

  document.getElementById('right').onclick = () => {
    rate(true);
  };
}

function rate(ok) {
  const w = words.find(
    item => item.id === deck[position]
  );

  if (!w) return;

  const previous = {
    correct: w.correct,
    wrong: w.wrong,
    interval: w.interval,
    due: w.due
  };

  if (studyMode === 'all') {
    if (!ok) deck.push(w.id);
    position++;
    flipped = false;
    renderStudy();
    return;
  }

  if (ok) {
    w.correct = (w.correct || 0) + 1;

    w.interval = w.interval === 0
      ? 1
      : Math.min(
          90,
          Math.max(1, Math.round(w.interval * 2))
        );

    w.due = Date.now() + w.interval * 86400000;
  } else {
    w.wrong = (w.wrong || 0) + 1;
    w.interval = 0;
    w.due = 0;
  }

  if (!save()) {
    Object.assign(w, previous);
    return;
  }

  if (!ok) {
    deck.push(w.id);
  }

  position++;
  flipped = false;

  renderStudy();
}

// -------------------------------
// CSV 읽기
// -------------------------------

function parseCSV(text) {
  text = text.replace(/^\uFEFF/, '');

  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        field += c;
      }
    } else if (c === '"' && field === '') {
      quoted = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') {
        i++;
      }

      row.push(field);

      if (row.some(x => x.trim())) {
        rows.push(row);
      }

      row = [];
      field = '';
    } else {
      field += c;
    }
  }

  if (quoted) {
    throw Error('CSV 따옴표가 닫히지 않았어.');
  }

  row.push(field);

  if (row.some(x => x.trim())) {
    rows.push(row);
  }

  return rows;
}

function parseExamplesJSON(value) {
  if (!value || !value.trim()) return null;

  let parsed;

  try {
    parsed = JSON.parse(value);
  } catch {
    throw Error('examples 열의 JSON 형식이 올바르지 않아.');
  }

  if (!Array.isArray(parsed)) {
    throw Error('examples 열은 배열이어야 해.');
  }

  return parsed.map(normalizeExample);
}

// -------------------------------
// CSV 가져오기 및 내보내기
// -------------------------------

function renderData() {
  layout(`
    <section class="panel">
      <h2>CSV 가져오기</h2>

      <p class="note">
        필수 열:
        <b>lang, term, meaning</b>
      </p>

      <p class="note muted">
        선택 열:
        reading, example, translation,
        note, examples

        언어 코드는 ja / en / zh야.
      </p>

      <p class="note muted">
        여러 예문은 examples 열에
        JSON 배열 형식으로 저장해.

        기존 단일 예문 CSV도 가져올 수 있어.
      </p>

      <input
        type="file"
        id="csv"
        accept=".csv,text/csv"
      >

      <p class="note muted">
        같은 언어에서 표제어가 같으면
        중복 등록하지 않아.
      </p>
    </section>

    <section class="panel">
      <h2>CSV 백업</h2>

      <p class="note">
        모든 언어의 단어와 예문을
        CSV로 내보낼 수 있어.
      </p>

      <button id="export">
        CSV 내보내기
      </button>
    </section>
  `);

  document.getElementById('csv').onchange = async e => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const rows = parseCSV(await file.text());

      const header = rows.shift()?.map(
        s => s.trim().toLowerCase()
      );

      const required = ['lang', 'term', 'meaning'];

      if (
        !header ||
        required.some(k => !header.includes(k))
      ) {
        throw Error(
          'CSV 첫 줄에 lang, term, meaning 열이 필요해.'
        );
      }

      const imported = [];
      let skipped = 0;

      for (const row of rows) {
        const d = Object.fromEntries(
          header.map((k, i) => [
            k,
            (row[i] || '').trim()
          ])
        );

        if (
          !languages[d.lang] ||
          !d.term ||
          !d.meaning ||
          [...words, ...imported].some(w =>
            w.lang === d.lang && w.term === d.term
          )
        ) {
          skipped++;
          continue;
        }

        const multi = parseExamplesJSON(
          d.examples || ''
        );

        const examples = multi ?? (
          d.example
            ? [{
                text: d.example,
                translation: d.translation || '',
                type: ''
              }]
            : []
        );

        imported.push({
          id: uid(),
          lang: d.lang,
          term: d.term,
          reading: d.reading || '',
          meaning: d.meaning,
          note: d.note || '',
          examples,
          due: 0,
          interval: 0,
          correct: 0,
          wrong: 0
        });
      }

      words.push(...imported);

      if (!save()) {
        words.splice(
          words.length - imported.length,
          imported.length
        );
        return;
      }

      alert(
        `${imported.length}개 등록, ${skipped}개 건너뜀`
      );

      render();
    } catch (err) {
      alert('가져오기 실패: ' + err.message);
    }
  };

  document.getElementById('export').onclick = () => {
    const header = [
      'lang',
      'term',
      'reading',
      'meaning',
      'example',
      'translation',
      'note',
      'examples'
    ];

    const quote = value =>
      '"' +
      String(value ?? '').replace(/"/g, '""') +
      '"';

    const csv = '\uFEFF' + [
      header.join(','),

      ...words.map(w => {
        const examples = getExamples(w);
        const first = examples[0] || {};

        const values = {
          lang: w.lang,
          term: w.term,
          reading: w.reading,
          meaning: w.meaning,
          example: first.text || '',
          translation: first.translation || '',
          note: w.note,
          examples: JSON.stringify(examples)
        };

        return header.map(k =>
          quote(values[k])
        ).join(',');
      })
    ].join('\r\n');

    const url = URL.createObjectURL(
      new Blob([csv], {
        type: 'text/csv;charset=utf-8'
      })
    );

    const a = document.createElement('a');

    a.href = url;
    a.download = 'my-vocabulary.csv';

    document.body.appendChild(a);
    a.click();
    a.remove();

    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 1000);
  };
}

// 앱 시작
render();
