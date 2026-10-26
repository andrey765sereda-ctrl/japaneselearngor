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
    completed: [], currentLesson: 9, srs: {}, drafts: {}, theme: 'dark',
    lastScore: null, today: todayKey(), reviewedToday: 0
  });
  function loadState() {
    try {
      const raw = JSON.parse(localStorage.getItem('bunkaJapanesePlusState') || '{}');
      const s = Object.assign(initialState(), raw);
      if (!Array.isArray(s.completed)) s.completed = [];
      if (!s.srs || typeof s.srs !== 'object') s.srs = {};
      if (!s.drafts || typeof s.drafts !== 'object') s.drafts = {};
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
  function renderLesson() {
    const l = currentLesson; const done = lessonDone(l.id);
    $('#lessonPanel').innerHTML = `
      <div class="lesson-kicker"><span class="pill">${escapeHTML(l.level)}</span><span class="index-text">УРОК ${String(l.id).padStart(3,'0')} / ${DATA.lessons.length}</span></div>
      ${l.genkiChapter ? `<p class="source-note">Дополнение по темам Genki I · глава ${l.genkiChapter}. Используй пояснения вместе с оригинальным учебником.</p>` : ''}
      <h3>${escapeHTML(l.title)}</h3>
      <p class="lesson-description">${escapeHTML(l.desc)}</p>
      <div class="rule-box"><strong>Разбери идею</strong><br>${escapeHTML(l.rule)}</div>
      <div class="example-box"><span class="example-jp" lang="ja">${escapeHTML(l.example)}</span><span class="example-reading" lang="ja">${escapeHTML(l.reading)}</span><span class="example-translation">${escapeHTML(l.translation)}</span>
        <div class="example-actions"><button class="mini-button" id="speakExample">▶ Прослушать</button><button class="mini-button" id="copyExample">Копировать японский</button></div>
      </div>
      <div class="practice-box"><h4>Практика с автоматической проверкой</h4><p>Вводи японский ответ — сайт будет проверять его автоматически по мере ввода. Проверка сравнивает с эталоном урока; другие грамматически правильные варианты могут отличаться.</p>
        <textarea class="practice-input" id="lessonDraft" placeholder="Введи японское предложение…">${escapeHTML(state.drafts[l.id] || '')}</textarea>
        <div class="example-actions"><button class="mini-button" id="saveDraft">Сохранить ответ</button><button class="mini-button" id="revealModel">Показать образец</button></div><p class="answer-check-result" id="lessonCheckResult" aria-live="polite"></p>
        <div class="model-answer" id="modelAnswer" hidden><strong>Образец для самопроверки</strong><br><span lang="ja">${escapeHTML(l.example)}</span><br><span>${escapeHTML(l.translation)}</span><br><small>${escapeHTML(l.rule)}</small></div>
      </div>
      <div class="lesson-bottom"><span>${done?'✓ Урок отмечен как пройденный':'После практики отметь урок пройденным.'}</span><div class="lesson-nav"><button class="button button-light" id="prevLesson" ${l.id===1?'disabled':''}>← Назад</button><button class="button button-dark" id="completeAndNext">${done?'Пройден ✓':'Отметить пройденным'} · Следующий →</button></div></div>`;
    $('#speakExample').addEventListener('click', () => speak(l.example));
    $('#copyExample').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(l.example); notify('Японский пример скопирован.'); }
      catch (_) { notify(l.example); }
    });
    const autoCheckLessonAnswer = () => {
      const normalizeAnswer = value => String(value || '').normalize('NFKC').replace(/[\s、。,.!！?？・]/g, '').trim();
      const userAnswer = normalizeAnswer($('#lessonDraft').value);
      const expected = normalizeAnswer(l.example);
      const result = $('#lessonCheckResult');
      if (!userAnswer) {
        result.textContent = '';
        result.className = 'answer-check-result';
        return;
      }
      const correct = userAnswer === expected;
      result.textContent = correct
        ? '✓ Верно — ответ совпадает с эталоном.'
        : 'Пока не совпадает с эталоном. Продолжай вводить ответ или проверь частицы, окончания и написание.';
      result.className = 'answer-check-result ' + (correct ? 'good' : 'bad');
    };
    $('#lessonDraft').addEventListener('input', () => {
      autoCheckLessonAnswer();
      state.drafts[l.id] = $('#lessonDraft').value;
      persist();
    });
    $('#saveDraft').addEventListener('click', () => {
      state.drafts[l.id] = $('#lessonDraft').value; persist(); notify('Ответ сохранён в этом браузере.');
    });
    $('#lessonDraft').addEventListener('change', () => { state.drafts[l.id] = $('#lessonDraft').value; persist(); });
    $('#revealModel').addEventListener('click', () => {
      const answer = $('#modelAnswer'); answer.hidden = !answer.hidden;
      $('#revealModel').textContent = answer.hidden ? 'Показать образец' : 'Скрыть образец';
    });
    $('#prevLesson').addEventListener('click', () => selectLesson(Math.max(1,l.id-1)));
    $('#completeAndNext').addEventListener('click', () => {
      if (!lessonDone(l.id)) state.completed.push(l.id);
      persist(); renderLessonList();
      const next = DATA.lessons.find(x => x.id > l.id && !lessonDone(x.id));
      if (next) selectLesson(next.id); else { renderLesson(); notify('Все уроки отмечены как пройденные.'); }
    });
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
        <div class="genki-card-head"><span class="genki-number">GENKI I · ГЛАВА ${String(ch.chapter).padStart(2,'0')}</span><span class="small-muted">${extraLessons.length} доп.</span></div>
        <h3>${escapeHTML(ch.title)}</h3><span class="genki-subtitle">${escapeHTML(ch.subtitle || '')}</span>
        <div class="genki-block"><b>ТЕМЫ ПО ОГЛАВЛЕНИЮ</b><ul>${topics}</ul></div>
        <div class="genki-block"><b>УЖЕ ЕСТЬ В ОСНОВНОМ КУРСЕ</b><p class="genki-focus">${main}</p></div>
        <div class="genki-block"><b>ДОБАВЛЕНО К САЙТУ</b>${extras}</div>
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
      // Evaluate immediately on selection; the next button then advances the quiz.
      quizChecked = true;
      const ok = quizSelected === q.a;
      if (ok) quizCorrect++;
      $$('.quiz-option').forEach((option, i) => {
        option.disabled = true;
        if (i === q.a) option.classList.add('right');
        else if (i === quizSelected) option.classList.add('wrong');
      });
      $('#quizFeedback').textContent = (ok ? 'Верно. ' : 'Пока неверно. ') + q.why;
      $('#quizFeedback').className = 'quiz-feedback ' + (ok ? 'good' : 'bad');
      $('#quizNext').disabled = false;
      $('#quizNext').textContent = quizIndex === quizSession.length - 1 ? 'Завершить тест' : 'Следующий вопрос →';
    }));
    $('#quizNext').disabled = true; $('#quizNext').textContent = 'Проверить ответ'; $('#quizFeedback').textContent='';
  }
  function quizNext() {
    if (quizSelected === null) return;
    if (!quizChecked) return;
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
    return [...words,...lessons];
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
    $('#flashcardArea').innerHTML = `<div class="flashcard" id="flipCard" role="button" tabindex="0" aria-label="Показать ответ"><span class="flash-tag">${c.type==='word'?'СЛОВО / '+escapeHTML(c.tag).toUpperCase():'УРОК / ГРАММАТИКА'}</span><span class="flash-front" lang="ja">${escapeHTML(c.front)}</span>${flashRevealed?`<span class="flash-back">${c.back}</span>`:'<span class="flash-hint">Нажми на карточку, чтобы открыть ответ</span>'}</div>
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
  $('#ankiCardCount').textContent=`${ankiRows().length} карточек: ${DATA.vocab.length} слов + ${DATA.lessons.length} уроков`;

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
  state.theme = 'dark';
  document.body.classList.add('dark');
  renderLessonList();renderLesson();renderGenkiMap();updateProgress();
})();
