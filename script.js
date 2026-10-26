(() => {
  'use strict';
  const DATA = window.BUNKA_DATA;
  if (!DATA || !Array.isArray(DATA.lessons)) {
    document.body.innerHTML = '<main style="padding:2rem;font-family:sans-serif"><h1>Не удалось загрузить учебные данные</h1><p>Проверь, что файл course-data.js находится рядом с index.html.</p></main>';
    return;
  }
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const todayKey = () => new Date().toISOString().slice(0, 10);
  const initialState = () => ({
    completed: [], currentLesson: 9, srs: {}, drafts: {}, topicScores: {}, theme: 'dark',
    kanjiKnown: [], kanjiQuizLastScore: null, kanjiQuizBestScore: null, kanjiQuizAnswers: {},
    lastScore: null, today: todayKey(), reviewedToday: 0
  });
  function loadState() {
    try {
      const raw = JSON.parse(localStorage.getItem('bunkaJapanesePlusState') || '{}');
      const s = Object.assign(initialState(), raw);
      if (!Array.isArray(s.completed)) s.completed = [];
      if (!s.srs || typeof s.srs !== 'object') s.srs = {};
      if (!s.drafts || typeof s.drafts !== 'object') s.drafts = {};
      if (!s.topicScores || typeof s.topicScores !== 'object') s.topicScores = {};
      if (!Array.isArray(s.kanjiKnown)) s.kanjiKnown = [];
      if (s.kanjiQuizLastScore === undefined) s.kanjiQuizLastScore = null;
      if (s.kanjiQuizBestScore === undefined) s.kanjiQuizBestScore = null;
      if (!s.kanjiQuizAnswers || typeof s.kanjiQuizAnswers !== 'object') s.kanjiQuizAnswers = {};
      if (s.today !== todayKey()) { s.today = todayKey(); s.reviewedToday = 0; }
      s.theme = 'dark';
      return s;
    } catch (_) { return initialState(); }
  }
  let state = loadState();
  let currentLesson = DATA.lessons.find(x => x.id === state.currentLesson) || DATA.lessons.find(x => x.track.includes('N5')) || DATA.lessons[0];
  let quizSession = [];
  let quizIndex = 0;
  let quizSelected = null;
  let quizChecked = false;
  let quizCorrect = 0;
  let flashQueue = [];
  let flashIndex = 0;
  let flashRevealed = false;

  const trackShort = (track) => {
    const found = DATA.trackMeta.find(x => x.name === track);
    return found ? found.level : '';
  };
  const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const escapeAttr = escapeHTML;
  function notify(message, error = false) {
    const old = $('.notice'); if (old) old.remove();
    const el = document.createElement('div'); el.className = 'notice' + (error ? ' error' : '');
    el.textContent = message; document.body.appendChild(el);
    window.setTimeout(() => el.remove(), 3300);
  }
  function persist() {
    try { localStorage.setItem('bunkaJapanesePlusState', JSON.stringify(state)); }
    catch (_) { notify('Браузер не смог сохранить прогресс. Экспортируй резервную копию JSON.', true); }
    updateProgress();
  }
  function lessonDone(id) { return state.completed.includes(id); }
  function lessonById(id) { return DATA.lessons.find(l => l.id === Number(id)); }

  // Fill the module selector from the authored curriculum.
  const filter = $('#trackFilter');
  [...new Set(DATA.lessons.map(l => l.track))].forEach(track => {
    const option = document.createElement('option'); option.value = track; option.textContent = track;
    filter.appendChild(option);
  });

  function renderLessonList() {
    const query = $('#lessonSearch').value.trim().toLowerCase();
    const track = filter.value;
    const status = $('#statusFilter').value;
    const result = DATA.lessons.filter(l => {
      const q = [l.title,l.rule,l.example,l.translation,l.level,l.track].join(' ').toLowerCase();
      if (query && !q.includes(query)) return false;
      if (track !== 'all' && l.track !== track) return false;
      if (status === 'done' && !lessonDone(l.id)) return false;
      if (status === 'todo' && lessonDone(l.id)) return false;
      return true;
    });
    $('#shownCount').textContent = `${result.length} урок${result.length===1?'':result.length<5?'а':'ов'}`;
    const list = $('#lessonList');
    if (!result.length) { list.innerHTML = '<div class="empty-list">Ничего не найдено. Попробуй другое слово или сбрось фильтр.</div>'; return; }
    let html = '', previousTrack = '';
    for (const l of result) {
      if (track === 'all' && l.track !== previousTrack) {
        html += `<div class="track-label">${escapeHTML(l.track)}</div>`;
        previousTrack = l.track;
      }
      const done = lessonDone(l.id);
      html += `<button class="lesson-row${currentLesson.id===l.id?' active':''}${done?' done':''}" data-lesson-id="${l.id}">
        <span class="row-index">${String(l.id).padStart(2,'0')}</span><span><span class="row-title">${escapeHTML(l.title)}</span><span class="row-level">${escapeHTML(l.level)}</span></span><span class="row-status">${done?'✓':'›'}</span></button>`;
    }
    list.innerHTML = html;
    $$('.lesson-row').forEach(btn => btn.addEventListener('click', () => selectLesson(Number(btn.dataset.lessonId))));
  }
  function selectLesson(id) {
    const l = lessonById(id); if (!l) return;
    currentLesson = l; state.currentLesson = l.id; persist(); renderLessonList(); renderLesson();
    if (window.matchMedia('(max-width: 760px)').matches) $('#lessonPanel').scrollIntoView({behavior:'smooth',block:'start'});
  }
  function renderOriginalModule(l) {
    if (!l || !l.originalCourse) return '';
    const goals = (l.goals || []).map(x => `<li>${escapeHTML(x)}</li>`).join('');
    const notes = (l.deepSections || []).map(x => `<article class="grammar-note"><h5>${escapeHTML(x.heading)}</h5><p>${escapeHTML(x.body)}</p></article>`).join('');
    const tasks = (l.homework || []).map(x => `<li>${escapeHTML(x)}</li>`).join('');
    const passage = l.readingPassage ? `<div class="genki-reading-exercise"><p class="genki-reading-passage" lang="ja">${escapeHTML(l.readingPassage)}</p><p><b>Вопрос по смыслу:</b> ${escapeHTML(l.readingQuestion || 'О чём этот текст?')}</p><details><summary>Показать перевод</summary><p>${escapeHTML(l.readingTranslation || '')}</p></details><button type="button" class="mini-button" id="speakGenkiPassage">▶ Прослушать текст</button></div>` : '';
    const words = (l.vocabList || []).map(x => `<tr><td lang="ja">${escapeHTML(x[0])}</td><td lang="ja">${escapeHTML(x[1])}</td><td>${escapeHTML(x[2])}</td></tr>`).join('');
    return `<section class="genki-original-module panel">
      <div class="genki-module-banner"><div><p class="eyebrow">${escapeHTML(l.genkiVolume || 'GENKI')} · ORIGINAL STUDY NOTES</p><h4>Результаты урока</h4></div><span class="genki-module-tag">${escapeHTML(l.genkiVolume || '')} · ${String(l.genkiChapter || '').padStart(2,'0')}</span></div>
      <ul class="genki-goal-list">${goals}</ul>
      ${passage ? `<h4>Чтение и понимание</h4>${passage}` : ''}
      <h4>Грамматика этой главы</h4><div class="grammar-note-grid">${notes}</div>
      <h4>Активная практика</h4><ol class="genki-task-list">${tasks}</ol>
      ${words ? `<h4>Дополнительный словарь урока</h4><div class="genki-vocab-scroll"><table class="genki-vocab-table"><thead><tr><th>Слово</th><th>Чтение</th><th>Значение</th></tr></thead><tbody>${words}</tbody></table></div>` : ''}
      <p class="genki-scope-note">Это самостоятельные объяснения и упражнения по темам соответствующей главы. Для оригинальных диалогов, текстов чтения, аудио и полного издательского словаря используй собственный экземпляр учебника.</p>
    </section>`;
  }

  function renderLesson() {
    const l = currentLesson; const done = lessonDone(l.id);
    $('#lessonPanel').innerHTML = `
      <div class="lesson-kicker"><span class="pill">${escapeHTML(l.level)}</span><span class="index-text">УРОК ${String(l.id).padStart(3,'0')} / ${DATA.lessons.length}</span></div>
      ${l.genkiChapter ? `<p class="source-note">Модуль ${escapeHTML(l.genkiVolume || 'Genki')} · глава ${l.genkiChapter}. Оригинальные объяснения и упражнения для самостоятельной практики.</p>` : ''}
      <h3>${escapeHTML(l.title)}</h3>
      <p class="lesson-description">${escapeHTML(l.desc)}</p>
      <div class="rule-box"><strong>Разбери идею</strong><br>${escapeHTML(l.rule)}</div>
      <section class="deep-lesson panel"><p class="eyebrow">ПОДРОБНОЕ ОБЪЯСНЕНИЕ</p><h4>1. Что нужно понять</h4><p>${escapeHTML(l.rule)} Это не просто фраза для заучивания: важно понять, какую задачу конструкция выполняет в предложении и какую информацию она связывает.</p><h4>2. Разбор примера</h4><p class="deep-japanese" lang="ja">${escapeHTML(l.example)}</p><p><b>Чтение:</b> <span lang="ja">${escapeHTML(l.reading)}</span></p><p><b>Смысл:</b> ${escapeHTML(l.translation)}</p><p>Прочитай пример вслух, затем раздели его на смысловые части. Найди знакомые слова, отметь грамматический элемент из этого урока и объясни себе, почему он стоит именно здесь. Не пытайся переводить механически слово за словом: сначала определи смысловую роль каждой части.</p><h4>3. Как закрепить</h4><ol><li>Вспомни правило своими словами, не глядя на текст.</li><li>Прочитай пример и объясни, как грамматика меняет смысл.</li><li>Замени один элемент предложения и проверь, остаётся ли конструкция правильной.</li><li>Составь собственное предложение, используя ту же модель.</li><li>Пройди тест ниже. Если ошибся, прочитай разбор и повтори тест после паузы.</li></ol><h4>4. На что обратить внимание</h4><p>Не считай предложение выученным только потому, что узнаёшь его глазами. Проверь, можешь ли ты воспроизвести форму по смыслу, прочитать её без подсказки и отличить от похожих конструкций. Сравнивай собственный ответ с моделью, особенно частицы, порядок слов и окончания.</p></section>
      ${renderOriginalModule(l)}
      <div class="example-box"><span class="example-jp" lang="ja">${escapeHTML(l.example)}</span><span class="example-reading" lang="ja">${escapeHTML(l.reading)}</span><span class="example-translation">${escapeHTML(l.translation)}</span>
        <div class="example-actions"><button class="mini-button" id="speakExample">▶ Прослушать</button><button class="mini-button" id="copyExample">Копировать японский</button></div>
      </div>
      <div class="practice-box"><h4>Активное вспоминание</h4><p>Не копируй пример сразу. Сначала попробуй составить своё предложение по этой теме; затем открой образец и сравни.</p>
        <textarea class="practice-input" id="lessonDraft" placeholder="Напиши своё предложение на японском…">${escapeHTML(state.drafts[l.id] || '')}</textarea>
        <div class="example-actions"><button class="mini-button" id="saveDraft">Сохранить ответ</button><button class="mini-button" id="revealModel">Показать образец</button></div>
        <div class="model-answer" id="modelAnswer" hidden><strong>Образец для самопроверки</strong><br><span lang="ja">${escapeHTML(l.example)}</span><br><span>${escapeHTML(l.translation)}</span><br><small>${escapeHTML(l.rule)}</small></div>
      </div>
      <section class="topic-test panel" id="topicTest"><div class="topic-test-head"><div><p class="eyebrow">ПРОВЕРКА ПО ЭТОЙ ТЕМЕ</p><h4>Мини-тест урока</h4><p>4 задания: смысл, чтение, распознавание примера и правило. Ответ проверяется сразу с объяснением.</p></div><span class="topic-test-count">4 вопроса</span></div><div id="topicQuizBody"></div><div class="topic-test-result" id="topicQuizResult" aria-live="polite"></div><button class="button button-light" id="topicQuizRestart" type="button">Пройти тест заново</button></section>
      <div class="lesson-bottom"><span>${done?'✓ Урок отмечен как пройденный':'После практики отметь урок пройденным.'}</span><div class="lesson-nav"><button class="button button-light" id="prevLesson" ${l.id===1?'disabled':''}>← Назад</button><button class="button button-dark" id="completeAndNext">${done?'Пройден ✓':'Отметить пройденным'} · Следующий →</button></div></div>`;
    $('#speakExample').addEventListener('click', () => speak(l.example));
    const passageSpeaker = $('#speakGenkiPassage');
    if (passageSpeaker && l.readingPassage) passageSpeaker.addEventListener('click', () => speak(l.readingPassage));
    $('#copyExample').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(l.example); notify('Японский пример скопирован.'); }
      catch (_) { notify(l.example); }
    });
    $('#saveDraft').addEventListener('click', () => {
      state.drafts[l.id] = $('#lessonDraft').value; persist(); notify('Ответ сохранён в этом браузере.');
    });
    $('#lessonDraft').addEventListener('change', () => { state.drafts[l.id] = $('#lessonDraft').value; persist(); });
    $('#revealModel').addEventListener('click', () => {
      const answer = $('#modelAnswer'); answer.hidden = !answer.hidden;
      $('#revealModel').textContent = answer.hidden ? 'Показать образец' : 'Скрыть образец';
    });
    initTopicQuiz(l);
    $('#prevLesson').addEventListener('click', () => selectLesson(Math.max(1,l.id-1)));
    $('#completeAndNext').addEventListener('click', () => {
      if (!lessonDone(l.id)) state.completed.push(l.id);
      persist(); renderLessonList();
      const next = DATA.lessons.find(x => x.id > l.id && !lessonDone(x.id));
      if (next) selectLesson(next.id); else { renderLesson(); notify('Все уроки отмечены как пройденные.'); }
    });
  }
  function shuffleCopy(arr) { return [...arr].sort(() => Math.random() - 0.5); }
  function initTopicQuiz(lesson) {
    const host = $('#topicQuizBody'); const result = $('#topicQuizResult'); const restart = $('#topicQuizRestart');
    if (!host || !result || !restart) return;
    const pool = DATA.lessons.filter(x => x.id !== lesson.id && x.example && x.translation);
    const otherTranslations = shuffleCopy([...new Set(pool.map(x => x.translation).filter(x => x !== lesson.translation))]).slice(0,3);
    const otherExamples = shuffleCopy([...new Set(pool.map(x => x.example).filter(x => x !== lesson.example))]).slice(0,3);
    const otherRules = shuffleCopy(pool.filter(x => x.rule !== lesson.rule)).slice(0,3);
    const questions = lesson.customQuiz?.length ? lesson.customQuiz : [
      {title:'1 · Понимание смысла', prompt:`Что означает предложение «${lesson.example}»?`, correct:lesson.translation, choices:shuffleCopy([lesson.translation,...otherTranslations]), why:`В этом уроке пример «${lesson.example}» используется со значением: ${lesson.translation}. Вернись к объяснению и найди, как грамматическая модель передаёт этот смысл.`},
      {title:'2 · Узнавание японской формы', prompt:`Какой пример относится к теме «${lesson.title}»?`, correct:lesson.example, choices:shuffleCopy([lesson.example,...otherExamples]), why:`Эталонный пример урока: ${lesson.example} — ${lesson.translation}. Обрати внимание на грамматическую форму, которую разбирает тема.`},
      {title:'3 · Чтение', prompt:`Какое чтение дано для предложения «${lesson.example}» в этом уроке?`, correct:lesson.reading, choices:shuffleCopy([lesson.reading,...shuffleCopy(pool.map(x=>x.reading).filter(x=>x && x!==lesson.reading)).slice(0,3)]), why:`В карточке урока чтение указано так: ${lesson.reading}. Сверяй чтение по частям, не пытайся угадывать только по знакомым кандзи.`},
      {title:'4 · Смысл правила', prompt:'Какое объяснение нужно применить к этой теме?', correct:lesson.rule, choices:shuffleCopy([lesson.rule,...otherRules.map(x=>x.rule)]), why:`Правило этого урока: ${lesson.rule}`}
    ];
    let index=0, score=0, locked=false;
    function render(){
      locked=false; result.textContent=''; restart.hidden=true;
      if(index>=questions.length){ state.topicScores[lesson.id] = {score, total:questions.length, date:todayKey()}; persist(); host.innerHTML=`<div class="topic-finish"><strong>Результат: ${score} из ${questions.length}</strong><p>${score===questions.length?'Отлично. Попробуй воспроизвести правило без подсказки и перейти к следующему уроку.':score>=3?'Хорошая база. Повтори объяснение для вопросов, в которых ошибся.':'Вернись к подробному объяснению и пройди тест ещё раз после повторения.'}</p></div>`; result.textContent='Результат сохранён в текущей сессии.'; restart.hidden=false; return; }
      const q=questions[index];
      host.innerHTML=`<div class="topic-progress">Вопрос ${index+1} из ${questions.length}</div><h5>${escapeHTML(q.title)}</h5><p class="topic-question">${escapeHTML(q.prompt)}</p><div class="topic-options">${q.choices.map((c,i)=>`<button type="button" class="topic-option" data-topic-opt="${i}">${escapeHTML(c)}</button>`).join('')}</div><div class="topic-feedback" id="topicFeedback" aria-live="polite"></div><button type="button" class="button button-dark" id="topicNext" disabled>${index===questions.length-1?'Завершить тест':'Следующий вопрос'}</button>`;
      $$('.topic-option').forEach(btn=>btn.addEventListener('click',()=>{
        if(locked)return; locked=true; const chosen=q.choices[Number(btn.dataset.topicOpt)]; const ok=chosen===q.correct; if(ok)score++;
        $$('.topic-option').forEach(b=>{b.disabled=true; if(b.textContent===q.correct)b.classList.add('topic-correct'); else if(b===btn)b.classList.add('topic-incorrect');});
        $('#topicFeedback').textContent=(ok?'Верно. ':'Не совсем. ')+q.why; $('#topicFeedback').className='topic-feedback '+(ok?'is-good':'is-bad'); $('#topicNext').disabled=false;
      }));
      $('#topicNext').addEventListener('click',()=>{if(!locked)return;index++;render();});
    }
    restart.addEventListener('click',()=>{index=0;score=0;render();}); render();
  }

  function speak(text) {
    if (!('speechSynthesis' in window)) { notify('Озвучивание не поддерживается этим браузером.', true); return; }
    window.speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.lang = 'ja-JP'; u.rate = .82; window.speechSynthesis.speak(u);
  }

  function renderGenkiMap() {
    const root = $('#genkiChapterGrid');
    if (!root || !Array.isArray(DATA.genkiChapters)) return;
    root.innerHTML = DATA.genkiChapters.map(ch => {
      const mainLessons = (ch.existingIds || []).map(lessonById).filter(Boolean);
      const extraLessons = (ch.extraIds || []).map(lessonById).filter(Boolean);
      const openId = (ch.extraIds || [])[0] || (ch.existingIds || [])[0] || 1;
      const topics = (ch.focus || []).map(x => `<li>${escapeHTML(x)}</li>`).join('');
      const main = mainLessons.length ? mainLessons.map(l => escapeHTML(l.title)).join(' · ') : 'Прямое соответствие не выделено';
      const extras = extraLessons.length ? `<ul>${extraLessons.map(l => `<li>${escapeHTML(l.title)}</li>`).join('')}</ul>` : '<p>Отдельное дополнение не требуется: используй связанные уроки основного курса.</p>';
      return `<article class="genki-card">
        <div class="genki-card-head"><span class="genki-number">${escapeHTML(ch.volume || 'GENKI I').toUpperCase()} · УРОК ${String(ch.chapter).padStart(2,'0')}</span><span class="small-muted">${extraLessons.length} урок</span></div>
        <h3>${escapeHTML(ch.title)}</h3><span class="genki-subtitle">${escapeHTML(ch.subtitle || '')}</span>
        <div class="genki-block"><b>ТЕМЫ ПО ОГЛАВЛЕНИЮ</b><ul>${topics}</ul></div>
        <div class="genki-block"><b>ЦЕЛИ И ТЕМЫ</b><p class="genki-focus">${main === 'Прямое соответствие не выделено' ? escapeHTML((ch.focus || []).join(' · ')) : main}</p></div>
        <div class="genki-block"><b>УРОК НА САЙТЕ</b>${extras}</div>
        <button class="button button-light" data-genki-lesson="${openId}">Открыть связанный урок <span>↗</span></button>
      </article>`;
    }).join('');
    root.querySelectorAll('[data-genki-lesson]').forEach(btn => btn.addEventListener('click', () => {
      selectLesson(Number(btn.dataset.genkiLesson));
      $('#course').scrollIntoView({behavior:'smooth'});
    }));
    const reading = $('#genkiReadingList');
    if (reading && Array.isArray(DATA.genkiReadingWriting)) {
      reading.innerHTML = DATA.genkiReadingWriting.map(name => `<span>${escapeHTML(name)}</span>`).join('');
    }
  }

  // Mixed quiz: random order and immediate explanations encourage retrieval and feedback.
  function startQuiz() {
    quizSession = [...DATA.quiz].sort(() => Math.random() - .5).slice(0,10);
    quizIndex = 0; quizSelected = null; quizChecked = false; quizCorrect = 0;
    $('#quizActions').hidden = false; $('#quizFeedback').textContent = ''; $('#quizFeedback').className='quiz-feedback';
    renderQuizQuestion();
  }
  function renderQuizQuestion() {
    quizSelected = null; quizChecked = false;
    const q = quizSession[quizIndex];
    $('#quizCounter').textContent = `ВОПРОС ${quizIndex+1} ИЗ ${quizSession.length}`;
    $('#quizTrack').style.width = `${(quizIndex/quizSession.length)*100}%`;
    $('#quizContent').innerHTML = `<div class="question-label">АКТИВНОЕ ВСПОМИНАНИЕ</div><h3 class="quiz-question">${escapeHTML(q.q)}</h3><div class="quiz-options">${q.opts.map((opt,i)=>`<button class="quiz-option" data-quiz-option="${i}"><span class="option-letter">${String.fromCharCode(65+i)}</span><span>${escapeHTML(opt)}</span></button>`).join('')}</div>`;
    $$('.quiz-option').forEach(btn => btn.addEventListener('click', () => {
      if (quizChecked) return;
      quizSelected = Number(btn.dataset.quizOption);
      $$('.quiz-option').forEach(b => b.classList.toggle('selected',b===btn));
      $('#quizNext').disabled = false; $('#quizNext').textContent = 'Проверить ответ';
    }));
    $('#quizNext').disabled = true; $('#quizNext').textContent = 'Проверить ответ'; $('#quizFeedback').textContent='';
  }
  function quizNext() {
    if (quizSelected === null) return;
    const q = quizSession[quizIndex];
    if (!quizChecked) {
      quizChecked = true; const ok = quizSelected === q.a; if (ok) quizCorrect++;
      $$('.quiz-option').forEach((btn,i)=>{btn.disabled=true;if(i===q.a)btn.classList.add('right');else if(i===quizSelected)btn.classList.add('wrong');});
      $('#quizFeedback').textContent = (ok?'Верно. ':'Пока неверно. ') + q.why;
      $('#quizFeedback').className = 'quiz-feedback ' + (ok?'good':'bad');
      $('#quizNext').textContent = quizIndex===quizSession.length-1?'Завершить тест':'Следующий вопрос →';
      return;
    }
    quizIndex++;
    if (quizIndex < quizSession.length) { renderQuizQuestion(); return; }
    const score = Math.round(quizCorrect / quizSession.length * 100); state.lastScore=score; persist();
    $('#quizCounter').textContent='ТЕСТ ЗАВЕРШЁН'; $('#quizTrack').style.width='100%';
    $('#quizContent').innerHTML = `<div class="question-label">ТВОЙ РЕЗУЛЬТАТ</div><h3 class="quiz-question">${quizCorrect} из ${quizSession.length} — ${score}%</h3><p>${score>=80?'Хороший результат. Продолжай чередовать грамматику, чтение и карточки.':'Повтори объяснения к ошибкам и пройди тест ещё раз через небольшой перерыв.'}</p><button class="button button-dark" id="quizAgain">Попробовать снова</button>`;
    $('#quizActions').hidden = true; $('#quizFeedback').textContent='Результат сохранён в прогрессе.';
    $('#quizAgain').addEventListener('click',startQuiz);
  }
  $('#startQuiz').addEventListener('click',startQuiz);
  $('#quizRestart').addEventListener('click',startQuiz);
  $('#quizNext').addEventListener('click',quizNext);

  // Website review scheduler. Anki remains the recommended long-term scheduler across devices.
  function getReviewCards() {
    const words = DATA.vocab.map((v,i)=>({key:'v:'+i,front:v.jp,back:`${v.reading} — ${v.meaning}<br><span class="flash-example">例：${v.example}</span>`,tag:v.tag,type:'word'}));
    const lessons = DATA.lessons.map((l,i)=>({key:'l:'+i,front:l.title,back:`${l.rule}<br><span class="flash-example" lang="ja">${l.example}</span><br>${l.reading}<br><b>${l.translation}</b>`,tag:'grammar',type:'lesson'}));
    const kanjiCards = (DATA.kanji || []).map(k=>({key:'k:'+k.char,front:k.char,back:`<b>${k.meaning}</b><br>音読み: ${k.onyomi || '—'}<br>訓読み: ${k.kunyomi || '—'}<br><span class="flash-example" lang="ja">${k.word}</span>（${k.reading}）<br>${k.wordMeaning}`,tag:k.stage,type:'kanji'}));
    return [...words,...lessons,...kanjiCards];
  }
  let allReviewCards = getReviewCards();
  function intervalLabel(ms) {
    if (ms < 60*60*1000) return `${Math.max(1,Math.round(ms/60000))} мин`;
    const days = ms/86400000; return days < 1.2 ? '1 день' : `${Math.round(days)} дн.`;
  }
  function updateReviewStats() {
    const now = Date.now();
    const due = allReviewCards.filter(c => state.srs[c.key]?.seen && state.srs[c.key].due <= now).length;
    const fresh = allReviewCards.filter(c => !state.srs[c.key]?.seen).length;
    $('#dueCount').textContent = due; $('#newCount').textContent = Math.min(10,fresh); $('#reviewedCount').textContent = state.reviewedToday || 0;
  }
  function startReview() {
    const now = Date.now();
    const due = allReviewCards.filter(c => state.srs[c.key]?.seen && state.srs[c.key].due <= now)
      .sort((a,b)=>(state.srs[a.key].due-state.srs[b.key].due));
    const fresh = allReviewCards.filter(c => !state.srs[c.key]?.seen).slice(0,10);
    flashQueue = [...due.slice(0,30),...fresh]; flashIndex=0; flashRevealed=false;
    if (!flashQueue.length) {
      $('#flashcardArea').innerHTML = '<div class="flashcard-empty"><span class="flash-symbol">完</span><h3>На сегодня всё готово</h3><p>Просроченных карточек нет. Завтра появятся следующие интервальные повторы.</p><button class="button button-dark" id="restartReview">Проверить снова</button></div>';
      $('#restartReview').addEventListener('click',startReview); return;
    }
    renderFlashcard();
  }
  function renderFlashcard() {
    const c = flashQueue[flashIndex];
    if (!c) {
      updateReviewStats(); persist();
      $('#flashcardArea').innerHTML = '<div class="flashcard-empty"><span class="flash-symbol">✓</span><h3>Сессия завершена</h3><p>Ты прошёл все карточки этой сессии. Новые интервалы сохранены в этом браузере.</p><button class="button button-dark" id="restartReview">Ещё раз проверить очередь</button></div>';
      $('#restartReview').addEventListener('click',startReview); return;
    }
    $('#flashcardArea').innerHTML = `<div class="flashcard" id="flipCard" role="button" tabindex="0" aria-label="Показать ответ"><span class="flash-tag">${c.type==='word'?'СЛОВО / '+escapeHTML(c.tag).toUpperCase():c.type==='kanji'?'КАНДЗИ / '+escapeHTML(c.tag).toUpperCase():'УРОК / ГРАММАТИКА'}</span><span class="flash-front" lang="ja">${escapeHTML(c.front)}</span>${flashRevealed?`<span class="flash-back">${c.back}</span>`:'<span class="flash-hint">Нажми на карточку, чтобы открыть ответ</span>'}</div>
      ${flashRevealed?`<div class="rate-buttons"><button data-rate="again"><b class="again-label">Снова</b><small>${intervalLabel(10*60000)}</small></button><button data-rate="hard"><b class="hard-label">Трудно</b><small>${intervalLabel(86400000)}</small></button><button data-rate="good"><b class="good-label">Хорошо</b><small>${intervalLabel(3*86400000)}</small></button><button data-rate="easy"><b class="easy-label">Легко</b><small>${intervalLabel(7*86400000)}</small></button></div>`:''}
      <div class="example-actions"><span class="small-muted">Карточка ${flashIndex+1} из ${flashQueue.length}</span><button class="mini-button" id="skipFlash">Пропустить →</button></div>`;
    const flip = () => { if (!flashRevealed) { flashRevealed=true; renderFlashcard(); } };
    $('#flipCard').addEventListener('click',flip);
    $('#flipCard').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();flip();}});
    $('#skipFlash').addEventListener('click',()=>{flashIndex++;flashRevealed=false;renderFlashcard();});
    $$('[data-rate]').forEach(btn=>btn.addEventListener('click',()=>rateCard(c,btn.dataset.rate)));
  }
  function rateCard(card,rating) {
    const old = state.srs[card.key] || {seen:false,interval:0,lapses:0};
    let days;
    if (rating==='again') { days=10/1440; old.lapses=(old.lapses||0)+1; }
    else if (rating==='hard') days=old.seen?Math.max(1,(old.interval||1)*1.2):1;
    else if (rating==='good') days=old.seen?Math.max(3,(old.interval||1)*2.0):3;
    else days=old.seen?Math.max(7,(old.interval||1)*2.5):7;
    state.srs[card.key]={seen:true,interval:days,due:Date.now()+days*86400000,lapses:old.lapses||0,lastRating:rating};
    state.reviewedToday=(state.reviewedToday||0)+1; state.today=todayKey();
    flashIndex++; flashRevealed=false; persist(); renderFlashcard(); updateReviewStats();
  }
  $('#startReview').addEventListener('click',startReview);

  // Export words and lesson notes as Anki-compatible UTF-8 TSV.
  function ankiRows() {
    const rows=[];
    for (const v of DATA.vocab) {
      const back = `${escapeHTML(v.reading)} — ${escapeHTML(v.meaning)}<br><br><b>Пример:</b> ${escapeHTML(v.example)}`;
      rows.push([v.jp,back,`bunka ${v.tag} vocabulary`]);
    }
    for (const l of DATA.lessons) {
      const back = `${escapeHTML(l.level)}<br><b>Правило:</b> ${escapeHTML(l.rule)}<br><br><span style="font-size:1.1em">${escapeHTML(l.example)}</span><br>${escapeHTML(l.reading)}<br><b>${escapeHTML(l.translation)}</b>`;
      let tag='grammar';
      if(l.track.includes('моды')||l.track.includes('мод')) tag='fashion';
      if(l.track.includes('Bunka')) tag='bunka';
      rows.push([l.title,back,`bunka ${tag} lesson_${String(l.id).padStart(3,'0')}`]);
    }
    for (const k of (DATA.kanji || [])) {
      const back = `<b>${escapeHTML(k.meaning)}</b><br>音読み: ${escapeHTML(k.onyomi || '—')}<br>訓読み: ${escapeHTML(k.kunyomi || '—')}<br><br><b>Пример:</b> ${escapeHTML(k.word)}（${escapeHTML(k.reading)}） — ${escapeHTML(k.wordMeaning)}<br><br>${escapeHTML(k.tip)}`;
      const tag = k.stage === 'Мода и дизайн' ? 'fashion_kanji' : 'kanji';
      rows.push([k.char,back,`bunka ${tag} ${k.char}`]);
    }
    return rows;
  }
  function downloadText(filename,content,mime='text/tab-separated-values;charset=utf-8') {
    const blob=new Blob([content],{type:mime}); const url=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
  }
  function exportAnki() {
    const rows=ankiRows();
    // Anki reads field-separated UTF-8 text; #tags column:3 routes the third field to tags.
    const content='#separator:tab\n#html:true\n#tags column:3\n'+rows.map(row=>row.map(x=>String(x).replace(/\t/g,' ').replace(/\r?\n/g,'<br>')).join('\t')).join('\n');
    downloadText('bunka_japanese_all_cards.tsv',content);
    notify(`Экспортировано ${rows.length} карточек для Anki.`);
  }
  $('#exportAnki').addEventListener('click',exportAnki);
  $('#ankiCardCount').textContent=`${ankiRows().length} карточек: ${DATA.vocab.length} слов + ${DATA.lessons.length} уроков + ${(DATA.kanji||[]).length} кандзи`;

  function updateProgress() {
    const n=DATA.lessons.length, completed=state.completed.length;
    const percent=Math.round(completed/n*100);
    $('#lessonCount').textContent=n; $('#wordCount').textContent=DATA.vocab.length;
    $('#progressPercent').textContent=percent+'%';
    $('#completedLessonsMetric').textContent=`${completed} / ${n}`;
    $('#lessonsBar').style.width=percent+'%';
    const reviewed=Object.keys(state.srs).filter(k=>state.srs[k]?.seen).length;
    $('#learnedCardsMetric').textContent=reviewed;
    $('#cardsBar').style.width=Math.round(reviewed/allReviewCards.length*100)+'%';
    $('#lastScoreMetric').textContent=state.lastScore===null?'—':state.lastScore+'%';
    $('#scoreBar').style.width=(state.lastScore||0)+'%';
    if ($('#kanjiTotalMetric')) $('#kanjiTotalMetric').textContent=(DATA.kanji||[]).length;
    const kanjiLearned=(DATA.kanji||[]).filter(k=>state.srs['k:'+k.char]?.seen).length;
    if ($('#kanjiLearnedMetric')) $('#kanjiLearnedMetric').textContent=kanjiLearned;
    const kanjiDue=(DATA.kanji||[]).filter(k=>state.srs['k:'+k.char]?.seen && state.srs['k:'+k.char].due<=Date.now()).length;
    if ($('#kanjiDueMetric')) $('#kanjiDueMetric').textContent=kanjiDue;
    if ($('#progressKanjiMetric')) $('#progressKanjiMetric').textContent=`${kanjiLearned} / ${(DATA.kanji||[]).length}`;
    if ($('#progressKanjiBar')) $('#progressKanjiBar').style.width=Math.round(kanjiLearned/Math.max(1,(DATA.kanji||[]).length)*100)+'%';
    updateReviewStats();
  }
  $('#lessonSearch').addEventListener('input',renderLessonList);
  filter.addEventListener('change',renderLessonList);
  $('#statusFilter').addEventListener('change',renderLessonList);
  $('#startLearning').addEventListener('click', e=>{e.preventDefault(); const first=DATA.lessons.find(l=>!lessonDone(l.id)&&!l.track.startsWith('Кандзи')); selectLesson(first?first.id:currentLesson.id); $('#course').scrollIntoView({behavior:'smooth'});});

  $('#exportProgress').addEventListener('click',()=>downloadText('bunka-japanese-progress.json',JSON.stringify(state,null,2),'application/json;charset=utf-8'));
  $('#importProgress').addEventListener('change',async event=>{
    const file=event.target.files?.[0];if(!file)return;
    try{const imported=JSON.parse((await file.text()).replace(/^\uFEFF/,''));if(!imported||typeof imported!=='object'||!Array.isArray(imported.completed))throw new Error('bad');
      state=Object.assign(initialState(),imported);state.theme='dark';if(state.today!==todayKey()){state.today=todayKey();state.reviewedToday=0;}
      document.body.classList.add('dark');currentLesson=lessonById(state.currentLesson)||DATA.lessons[8];persist();renderLessonList();renderLesson();notify('Резервная копия прогресса импортирована.');
    }catch(_){notify('Не удалось импортировать файл. Выбери JSON, ранее экспортированный с этого сайта.',true);}event.target.value='';
  });
  $('#resetProgress').addEventListener('click',()=>{
    if(!window.confirm('Сбросить пройденные уроки, черновики и расписание карточек в этом браузере? Это нельзя отменить без резервной копии.'))return;
    state=initialState();currentLesson=DATA.lessons.find(l=>l.id===9)||DATA.lessons[0];document.body.classList.add('dark');persist();renderLessonList();renderLesson();notify('Прогресс сброшен.');
  });


  // Dedicated kanji learning module: flashcards, writing canvas, retrieval quiz, local SRS.
  const kanjiData = Array.isArray(DATA.kanji) ? DATA.kanji : [];
  let kanjiFiltered = [...kanjiData];
  let kanjiCurrent = kanjiData[0] || null;
  let kanjiRevealed = false;
  let kanjiDueOnly = false;
  let kanjiQuizSession = [];
  let kanjiQuizIndex = 0;
  let kanjiQuizScore = 0;
  let kanjiQuizAnswered = false;
  let kanjiQuizSelected = null;
  let kanjiCanvasStrokes = [];
  let kanjiCurrentStroke = null;
  let kanjiQuizFinished = false;
  const kanjiKey = k => 'k:' + k.char;
  const kanjiDue = k => Boolean(state.srs[kanjiKey(k)]?.seen && state.srs[kanjiKey(k)].due <= Date.now());
  const kanjiSeen = k => Boolean(state.srs[kanjiKey(k)]?.seen);

  function kanjiFilterList() {
    const query = ($('#kanjiSearch')?.value || '').trim().toLocaleLowerCase();
    const stage = $('#kanjiStageFilter')?.value || 'all';
    kanjiFiltered = kanjiData.filter(k => {
      if (stage !== 'all' && ((stage === 'Genki I' || stage === 'Genki II') ? k.genkiVolume !== stage : k.stage !== stage)) return false;
      if (kanjiDueOnly && !kanjiDue(k)) return false;
      const haystack = [k.char,k.meaning,k.onyomi,k.kunyomi,k.word,k.reading,k.wordMeaning,k.stage].join(' ').toLocaleLowerCase();
      return !query || haystack.includes(query);
    });
    if (!kanjiFiltered.some(k => k.char === kanjiCurrent?.char)) kanjiCurrent = kanjiFiltered[0] || null;
    renderKanjiList();
    renderKanjiCard();
    renderKanjiWriteInfo();
  }

  function renderKanjiList() {
    const list = $('#kanjiList');
    if (!list) return;
    $('#kanjiShownCount').textContent = `${kanjiFiltered.length} / ${kanjiData.length}`;
    if (!kanjiFiltered.length) { list.innerHTML = '<p class="small-muted kanji-list-empty">Ничего не найдено. Сними фильтр или проверь запрос.</p>'; return; }
    list.innerHTML = kanjiFiltered.map(k => `<button type="button" class="kanji-list-item ${kanjiCurrent?.char===k.char?'active':''} ${kanjiSeen(k)?'seen':''}" data-kanji-char="${escapeAttr(k.char)}" aria-label="Кандзи ${escapeAttr(k.char)}: ${escapeAttr(k.meaning)}"><span class="kanji-list-glyph" lang="ja">${escapeHTML(k.char)}</span><span class="kanji-list-meta"><b>${escapeHTML(k.meaning)}</b><small>${escapeHTML(k.reading)} · ${escapeHTML(k.officialGenki ? `Genki ${k.genkiChapter}` : k.stage)}</small></span><span class="kanji-seen-mark">${kanjiSeen(k)?'✓':''}</span></button>`).join('');
    list.querySelectorAll('[data-kanji-char]').forEach(btn => btn.addEventListener('click', () => selectKanji(btn.dataset.kanjiChar)));
  }

  function renderKanjiCard() {
    const host = $('#kanjiCardHost');
    if (!host) return;
    if (!kanjiCurrent) {
      host.innerHTML = '<div class="kanji-empty"><span class="kanji-empty-glyph">漢字</span><h3>Карточки не найдены</h3><p>Измени фильтр или нажми «Повторить просроченные» ещё раз, чтобы вернуться ко всем знакам.</p></div>';
      return;
    }
    const k = kanjiCurrent;
    const srs = state.srs[kanjiKey(k)] || {};
    host.innerHTML = `<div class="kanji-card-top"><span class="panel-label">${escapeHTML(k.officialGenki ? `${k.genkiVolume} · УРОК ${String(k.genkiChapter).padStart(2,'0')}` : k.stage).toUpperCase()}</span><span class="kanji-status">${kanjiSeen(k) ? 'УЖЕ ПОВТОРЯЛСЯ' : 'НОВЫЙ ЗНАК'}${kanjiDue(k) ? ' · ПОРА ПОВТОРИТЬ' : ''}</span></div>
      <button type="button" class="kanji-reveal-card" id="kanjiReveal" aria-label="Показать значение и чтения"><span lang="ja">${escapeHTML(k.char)}</span><small>${kanjiRevealed?'Нажми, чтобы скрыть ответ':'Нажми, чтобы открыть ответ'}</small></button>
      ${kanjiRevealed ? `<div class="kanji-details"><h3>${escapeHTML(k.meaning)}</h3><div class="kanji-reading-row"><b>音読み</b><span lang="ja">${escapeHTML(k.onyomi || '—')}</span></div><div class="kanji-reading-row"><b>訓読み</b><span lang="ja">${escapeHTML(k.kunyomi || '—')}</span></div><div class="kanji-word-example"><span class="panel-label">ПРИМЕР СЛОВА</span><strong lang="ja">${escapeHTML(k.word)}</strong><span lang="ja">${escapeHTML(k.reading)}</span><p>${escapeHTML(k.wordMeaning)}</p></div><p class="kanji-tip">${escapeHTML(k.tip)}</p><p class="kanji-tip"><a href="https://jisho.org/search/${encodeURIComponent(k.char)}%20%23kanji" target="_blank" rel="noopener">Сверить порядок черт в словаре ↗</a></p><p class="kanji-srs-next">${srs.seen ? `Следующее повторение: ${srs.due <= Date.now() ? 'уже наступило' : intervalLabel(srs.due-Date.now())}` : 'После ответа знак появится в расписании повторения.'}</p></div>` : `<p class="kanji-front-prompt">Вспомни значение, чтения и одно слово с этим знаком, прежде чем раскрыть карточку.</p>`}
      <div class="kanji-card-actions"><button type="button" class="button button-light" id="kanjiPrevious">← Предыдущий</button><button type="button" class="button button-light" id="kanjiGoWrite">Написать</button><button type="button" class="button button-dark" id="kanjiNext">Следующий →</button></div>
      ${kanjiRevealed ? `<div class="kanji-rate-buttons"><button type="button" data-kanji-rate="again"><b>Повторить</b><small>10 минут</small></button><button type="button" data-kanji-rate="hard"><b>Трудно</b><small>1 день</small></button><button type="button" data-kanji-rate="good"><b>Хорошо</b><small>3 дня</small></button><button type="button" data-kanji-rate="easy"><b>Легко</b><small>7 дней</small></button></div>` : ''}`;
    $('#kanjiReveal').addEventListener('click', () => { kanjiRevealed=!kanjiRevealed; renderKanjiCard(); });
    $('#kanjiPrevious').addEventListener('click', () => moveKanji(-1));
    $('#kanjiNext').addEventListener('click', () => moveKanji(1));
    $('#kanjiGoWrite').addEventListener('click', () => setKanjiMode('write'));
    $$('[data-kanji-rate]').forEach(btn => btn.addEventListener('click', () => rateKanji(k, btn.dataset.kanjiRate)));
  }

  function selectKanji(char) {
    const picked = kanjiData.find(k => k.char === char);
    if (!picked) return;
    kanjiCurrent = picked; kanjiRevealed = false; kanjiCanvasStrokes = [];
    renderKanjiList(); renderKanjiCard(); renderKanjiWriteInfo(); clearKanjiCanvas();
  }
  function moveKanji(delta) {
    const pool = kanjiFiltered.length ? kanjiFiltered : kanjiData;
    if (!pool.length) return;
    const i = Math.max(0,pool.findIndex(k=>k.char===kanjiCurrent?.char));
    kanjiCurrent = pool[(i+delta+pool.length)%pool.length]; kanjiRevealed=false;
    renderKanjiList(); renderKanjiCard(); renderKanjiWriteInfo(); kanjiCanvasStrokes=[]; clearKanjiCanvas();
  }
  function rateKanji(k, rating) {
    const key = kanjiKey(k); const old = state.srs[key] || {seen:false,interval:0,lapses:0};
    let days;
    if (rating==='again') { days=10/1440; old.lapses=(old.lapses||0)+1; }
    else if (rating==='hard') days=old.seen?Math.max(1,(old.interval||1)*1.2):1;
    else if (rating==='good') days=old.seen?Math.max(3,(old.interval||1)*2):3;
    else days=old.seen?Math.max(7,(old.interval||1)*2.5):7;
    state.srs[key]={seen:true,interval:days,due:Date.now()+days*86400000,lapses:old.lapses||0,lastRating:rating};
    state.kanjiQuizAnswers[k.char]=state.kanjiQuizAnswers[k.char]||{};
    if (rating==='good'||rating==='easy') state.kanjiKnown=[...new Set([...(state.kanjiKnown||[]),k.char])];
    else state.kanjiKnown=(state.kanjiKnown||[]).filter(x=>x!==k.char);
    state.reviewedToday=(state.today===todayKey()?state.reviewedToday||0:0)+1; state.today=todayKey();
    persist(); renderKanjiList(); renderKanjiCard();
  }

  function setKanjiMode(mode) {
    const panelByMode={study:'#kanjiStudyPanel',write:'#kanjiWritePanel',quiz:'#kanjiQuizPanel'};
    Object.entries(panelByMode).forEach(([key,sel])=>{ $(sel).hidden = key!==mode; });
    $$('[data-kanji-mode]').forEach(btn=>{const active=btn.dataset.kanjiMode===mode;btn.classList.toggle('active',active);btn.setAttribute('aria-selected',String(active));});
    if(mode==='write') { renderKanjiWriteInfo(); setTimeout(resizeKanjiCanvas,0); }
    if(mode==='quiz' && !kanjiQuizSession.length) $('#kanjiQuizContent').innerHTML='<p class="small-muted">Нажми «Начать 10 вопросов», чтобы проверить значения и чтения.</p>';
  }

  function renderKanjiWriteInfo() {
    if (!kanjiCurrent || !$('#kanjiWriteGlyph')) return;
    $('#kanjiWriteGlyph').textContent=kanjiCurrent.char;
    $('#kanjiWriteMeaning').textContent=kanjiCurrent.meaning;
    $('#kanjiWriteWord').textContent=`${kanjiCurrent.word} — ${kanjiCurrent.reading} — ${kanjiCurrent.wordMeaning}`;
    $('#kanjiWriteHintText').innerHTML=`音読み: ${escapeHTML(kanjiCurrent.onyomi||'—')} · 訓読み: ${escapeHTML(kanjiCurrent.kunyomi||'—')}。 Пример: ${escapeHTML(kanjiCurrent.word)}（${escapeHTML(kanjiCurrent.reading)}） — ${escapeHTML(kanjiCurrent.wordMeaning)}。 ${escapeHTML(kanjiCurrent.tip)}<br><a href="https://jisho.org/search/${encodeURIComponent(kanjiCurrent.char)}%20%23kanji" target="_blank" rel="noopener">Сверить порядок черт в словаре ↗</a>`;
    $('#kanjiWriteHintText').hidden=true;
  }
  function setupKanjiCanvas() {
    const canvas=$('#kanjiCanvas'); if(!canvas) return;
    const ctx=canvas.getContext('2d');
    function paintGrid() {
      const w=canvas.width,h=canvas.height;ctx.clearRect(0,0,w,h);ctx.fillStyle='#111317';ctx.fillRect(0,0,w,h);
      ctx.strokeStyle='#32353d';ctx.lineWidth=2;ctx.setLineDash([7,8]);ctx.beginPath();ctx.moveTo(w/2,0);ctx.lineTo(w/2,h);ctx.moveTo(0,h/2);ctx.lineTo(w,h/2);ctx.stroke();ctx.setLineDash([]);
      ctx.strokeStyle='#25282f';ctx.beginPath();ctx.moveTo(w*.2,h*.2);ctx.lineTo(w*.8,h*.8);ctx.moveTo(w*.8,h*.2);ctx.lineTo(w*.2,h*.8);ctx.stroke();
      ctx.strokeStyle='#e7e2d9';ctx.lineWidth=10;ctx.lineCap='round';ctx.lineJoin='round';
      for(const stroke of kanjiCanvasStrokes){if(stroke.length<1)continue;ctx.beginPath();ctx.moveTo(stroke[0].x,stroke[0].y);for(const pt of stroke.slice(1))ctx.lineTo(pt.x,pt.y);ctx.stroke();}
      if(kanjiCurrentStroke?.length){ctx.beginPath();ctx.moveTo(kanjiCurrentStroke[0].x,kanjiCurrentStroke[0].y);for(const pt of kanjiCurrentStroke.slice(1))ctx.lineTo(pt.x,pt.y);ctx.stroke();}
    }
    canvas._paintKanji=paintGrid;
    const xy=e=>{const r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left)*canvas.width/r.width,y:(e.clientY-r.top)*canvas.height/r.height};};
    canvas.addEventListener('pointerdown',e=>{e.preventDefault();canvas.setPointerCapture(e.pointerId);kanjiCurrentStroke=[xy(e)];paintGrid();});
    canvas.addEventListener('pointermove',e=>{if(!kanjiCurrentStroke)return;kanjiCurrentStroke.push(xy(e));paintGrid();});
    const end=()=>{if(kanjiCurrentStroke){kanjiCanvasStrokes.push(kanjiCurrentStroke);kanjiCurrentStroke=null;paintGrid();}};
    canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',end);canvas.addEventListener('lostpointercapture',end);
    $('#kanjiCanvasClear').addEventListener('click',()=>{kanjiCanvasStrokes=[];kanjiCurrentStroke=null;paintGrid();});
    $('#kanjiCanvasUndo').addEventListener('click',()=>{kanjiCanvasStrokes.pop();kanjiCurrentStroke=null;paintGrid();});
    $('#kanjiWriteHint').addEventListener('click',()=>{$('#kanjiWriteHintText').hidden=!$('#kanjiWriteHintText').hidden;});
    $('#kanjiWriteAgain').addEventListener('click',()=>{if(kanjiCurrent)rateKanji(kanjiCurrent,'again');notify('Кандзи поставлен на повторение.');});
    $('#kanjiWriteGood').addEventListener('click',()=>{if(kanjiCurrent)rateKanji(kanjiCurrent,'good');notify('Практика письма отмечена.');});
    resizeKanjiCanvas();
  }
  function resizeKanjiCanvas(){const c=$('#kanjiCanvas');if(c&&c._paintKanji)c._paintKanji();}
  function clearKanjiCanvas(){const c=$('#kanjiCanvas');if(c&&c._paintKanji)c._paintKanji();}

  function startKanjiQuiz() {
    const stage=$('#kanjiQuizStage').value;
    const pool=kanjiData.filter(k=>stage==='all'||((stage==='Genki I'||stage==='Genki II')?k.genkiVolume===stage:k.stage===stage));
    if(pool.length<4){notify('Для теста нужно минимум четыре знака.',true);return;}
    kanjiQuizSession=shuffleCopy(pool).slice(0,Math.min(10,pool.length)).map(k=>{
      const askReading=Math.random()<0.5;
      const correct=askReading?k.reading:k.meaning;
      const others=shuffleCopy(pool.filter(x=>x.char!==k.char).map(x=>askReading?x.reading:x.meaning).filter(x=>x&&x!==correct));
      const choices=shuffleCopy([correct,...[...new Set(others)].slice(0,3)]);
      return {k,askReading,correct,choices};
    });
    kanjiQuizIndex=0;kanjiQuizScore=0;kanjiQuizAnswered=false;kanjiQuizSelected=null;kanjiQuizFinished=false;
    $('#kanjiQuizFeedback').textContent='';$('#kanjiQuizNext').disabled=true;renderKanjiQuizQuestion();
  }
  function renderKanjiQuizQuestion() {
    const host=$('#kanjiQuizContent');
    if(kanjiQuizIndex>=kanjiQuizSession.length){
      kanjiQuizFinished=true;
      const score=Math.round(kanjiQuizScore/Math.max(1,kanjiQuizSession.length)*100);
      state.kanjiQuizLastScore=score;state.kanjiQuizBestScore=state.kanjiQuizBestScore===null?score:Math.max(state.kanjiQuizBestScore,score);persist();
      host.innerHTML=`<div class="kanji-quiz-result"><span class="kanji-result-glyph">${score>=80?'合格':'復習'}</span><h3>${score}% — ${kanjiQuizScore} из ${kanjiQuizSession.length}</h3><p>${score>=80?'Хороший результат. Через несколько дней повтори эти знаки в другом порядке.':'Повтори объяснения к ошибкам, затем пройди тест ещё раз после небольшого перерыва.'}</p><p>Лучший результат: ${state.kanjiQuizBestScore}%</p><button type="button" class="button button-dark" id="kanjiQuizAgain">Повторить тест</button></div>`;
      $('#kanjiQuizFeedback').textContent='Результат сохранён в «Мой прогресс».';$('#kanjiQuizNext').disabled=true;$('#kanjiQuizNext').textContent='Тест завершён';
      $('#kanjiQuizAgain').addEventListener('click',startKanjiQuiz);return;
    }
    const q=kanjiQuizSession[kanjiQuizIndex];kanjiQuizAnswered=false;kanjiQuizSelected=null;
    host.innerHTML=`<div class="kanji-quiz-top"><span>ВОПРОС ${kanjiQuizIndex+1} ИЗ ${kanjiQuizSession.length}</span><div class="kanji-quiz-progress"><span style="width:${kanjiQuizIndex/kanjiQuizSession.length*100}%"></span></div></div><h4 class="kanji-quiz-prompt">${q.askReading?'Выбери чтение слова:':'Что означает этот кандзи?'}</h4><div class="kanji-quiz-target" lang="ja">${escapeHTML(q.askReading?q.k.word:q.k.char)}${q.askReading?`<small>${escapeHTML(q.k.meaning)}</small>`:''}</div><div class="kanji-quiz-options">${q.choices.map((c,i)=>`<button type="button" class="kanji-quiz-option" data-kanji-option="${i}">${escapeHTML(c)}</button>`).join('')}</div>`;
    $('#kanjiQuizFeedback').textContent='Выбери ответ. После выбора появится объяснение.';$('#kanjiQuizNext').disabled=true;$('#kanjiQuizNext').textContent=kanjiQuizIndex===kanjiQuizSession.length-1?'Завершить тест':'Следующий вопрос';
    host.querySelectorAll('[data-kanji-option]').forEach(btn=>btn.addEventListener('click',()=>{
      if(kanjiQuizAnswered)return;kanjiQuizAnswered=true;kanjiQuizSelected=Number(btn.dataset.kanjiOption);
      const ok=q.choices[kanjiQuizSelected]===q.correct;if(ok)kanjiQuizScore++;
      host.querySelectorAll('[data-kanji-option]').forEach(b=>{b.disabled=true;if(b.textContent===q.correct)b.classList.add('correct');else if(b===btn)b.classList.add('incorrect');});
      $('#kanjiQuizFeedback').innerHTML=`<b>${ok?'Верно.':'Неверно.'}</b> ${q.k.char} — ${escapeHTML(q.k.meaning)}. 音読み: ${escapeHTML(q.k.onyomi||'—')}; 訓読み: ${escapeHTML(q.k.kunyomi||'—')}. Пример: ${escapeHTML(q.k.word)}（${escapeHTML(q.k.reading)}）— ${escapeHTML(q.k.wordMeaning)}.`;
      $('#kanjiQuizNext').disabled=false;
    }));
  }
  function nextKanjiQuizQuestion(){if(!kanjiQuizAnswered)return;kanjiQuizIndex++;renderKanjiQuizQuestion();}

  function initKanjiModule() {
    if(!$('#kanjiCardHost'))return;
    $('#kanjiSearch').addEventListener('input',()=>{kanjiDueOnly=false;$('#kanjiDueOnly').classList.remove('active');kanjiFilterList();});
    $('#kanjiStageFilter').addEventListener('change',kanjiFilterList);
    $('#kanjiDueOnly').addEventListener('click',()=>{kanjiDueOnly=!kanjiDueOnly;$('#kanjiDueOnly').classList.toggle('active',kanjiDueOnly);kanjiFilterList();});
    $$('[data-kanji-mode]').forEach(btn=>btn.addEventListener('click',()=>setKanjiMode(btn.dataset.kanjiMode)));
    $('#kanjiQuizStart').addEventListener('click',startKanjiQuiz);
    $('#kanjiQuizNext').addEventListener('click',nextKanjiQuizQuestion);
    setupKanjiCanvas();
    kanjiFilterList();
  }

  state.theme = 'dark';
  document.body.classList.add('dark');
  initKanjiModule();
  renderLessonList();renderLesson();renderGenkiMap();updateProgress();
})();
