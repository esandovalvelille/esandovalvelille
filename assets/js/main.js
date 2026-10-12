import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js';
import { getDatabase, ref, onValue, push, set, remove } from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-database.js';
import { getStorage, ref as storageRef, uploadBytesResumable, getDownloadURL, deleteObject } from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-storage.js';
import { firebaseConfig, moderatorEmail, moderatorUid } from './firebase-config.js';

const configReady = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId && !firebaseConfig.apiKey.startsWith('REPLACE_') && moderatorEmail && moderatorUid && moderatorUid !== 'REPLACE_WITH_FIREBASE_AUTH_UID');
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const database = getDatabase(app);
const storage = getStorage(app);
const POST_PATH = 'publishedPosts';
const DRAFT_PATH = 'drafts';
const COMMENT_PATH = 'postComments';
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_VIDEO_BYTES = 200 * 1024 * 1024;
const sections = { journal: 'Publicaciones', accounting: 'Contabilidad & operaciones', technology: 'Tecnología & desarrollo', reflections: 'Reflexiones & vida' };
const state = { posts: [], drafts: [], user: null, filter: 'all', search: '', selectedMedia: null, commentUnsubscribe: null, moderatorUnsubscribers: [] };
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const dateFormatter = new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'long', year: 'numeric' });

function escapeHTML(value = '') {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}
function safeMediaUrl(value = '') {
  if (!String(value).trim()) return '';
  try { const url = new URL(value, location.href); return ['https:', 'http:'].includes(url.protocol) ? url.href : ''; } catch { return ''; }
}
function formatDate(timestamp) { return dateFormatter.format(new Date(Number(timestamp) || Date.now())); }
function showMessage(element, message, isError = false) { element.textContent = message; element.classList.toggle('error', isError); }
function openDialog(id) { const dialog = document.getElementById(id); if (dialog && !dialog.open) dialog.showModal(); }
function closeDialog(id) { const dialog = document.getElementById(id); if (dialog?.open) dialog.close(); }

function postMediaMarkup(post, className = '') {
  const url = safeMediaUrl(post.mediaUrl || '');
  if (!url) return '';
  const alt = escapeHTML(post.title || 'Imagen de la publicación');
  if (post.mediaType === 'video') return `<video class="${className}" src="${escapeHTML(url)}" controls playsinline preload="metadata" aria-label="Video: ${alt}"></video>`;
  return `<img class="${className}" src="${escapeHTML(url)}" alt="${alt}" loading="lazy">`;
}

function renderPosts() {
  const all = [...state.posts].sort((a, b) => (b.publishedAt || b.updatedAt || 0) - (a.publishedAt || a.updatedAt || 0));
  const featured = all.find(post => post.featured) || all[0];
  const featuredNode = $('#featuredPost');
  $('#featuredCount').textContent = all.length ? String(all.length).padStart(2, '0') : '—';
  if (featured) {
    const media = postMediaMarkup(featured, 'featured-media');
    featuredNode.innerHTML = `${media || '<div class="featured-placeholder"><span class="placeholder-mark">ES.</span><p>Una historia desde mi cuaderno</p></div>'}<div class="featured-copy"><p class="eyebrow">${escapeHTML(featured.category)} · ${escapeHTML(formatDate(featured.publishedAt))}</p><h3>${escapeHTML(featured.title)}</h3><p>${escapeHTML(featured.summary)}</p><button class="text-link" data-open-post="${escapeHTML(featured.id)}">Leer publicación <span>↗</span></button></div>`;
  } else {
    featuredNode.innerHTML = '<div class="featured-placeholder"><span class="placeholder-mark">ES.</span><p>Las historias empiezan con una primera publicación.</p></div><div class="featured-copy"><p class="eyebrow">UN CUADERNO EN CONSTRUCCIÓN</p><h3>Un lugar para las ideas que van tomando forma.</h3><p>Pronto encontrarás aquí notas, proyectos y aprendizajes personales.</p></div>';
  }
  const categories = [...new Set(all.map(post => post.category).filter(Boolean))];
  const filters = $('#categoryFilters');
  filters.innerHTML = `<button class="filter-chip ${state.filter === 'all' ? 'active' : ''}" data-filter="all">Todo</button>${categories.map(category => `<button class="filter-chip ${state.filter === `category:${category}` ? 'active' : ''}" data-filter="category:${escapeHTML(category)}">${escapeHTML(category)}</button>`).join('')}`;
  const visible = all.filter(post => {
    const matchesFilter = state.filter === 'all' || (state.filter.startsWith('category:') ? post.category === state.filter.slice(9) : post.section === state.filter.slice(8));
    const haystack = `${post.title} ${post.summary} ${post.category} ${post.content}`.toLocaleLowerCase('es');
    return matchesFilter && haystack.includes(state.search.toLocaleLowerCase('es'));
  });
  $('#postsGrid').innerHTML = visible.map(post => `<article class="post-card" tabindex="0" role="button" aria-label="Leer ${escapeHTML(post.title)}" data-open-post="${escapeHTML(post.id)}"><div class="post-image-wrap">${postMediaMarkup(post)}${post.mediaType === 'video' ? '<span class="media-label">VIDEO</span>' : ''}</div><div class="post-meta"><span class="category">${escapeHTML(post.category)}</span><span>·</span><time>${escapeHTML(formatDate(post.publishedAt))}</time></div><h3 class="post-card-title">${escapeHTML(post.title)}</h3><p class="post-card-summary">${escapeHTML(post.summary)}</p></article>`).join('');
  $('#emptyState').hidden = visible.length > 0;
  renderManagedPosts();
}

function renderManagedPosts() {
  const list = $('#managedPosts');
  if (!list) return;
  const entries = [...state.posts.map(post => ({ ...post, status: 'Publicado' })), ...state.drafts.map(post => ({ ...post, status: 'Borrador' }))].sort((a, b) => (b.updatedAt || b.publishedAt || 0) - (a.updatedAt || a.publishedAt || 0));
  $('#manageCount').textContent = entries.length;
  $('#managedEmpty').hidden = entries.length > 0;
  list.innerHTML = entries.map(post => `<article class="managed-item"><div><h3>${escapeHTML(post.title || 'Sin título')}</h3><p>${escapeHTML(post.status)} · ${escapeHTML(post.category || '')} · ${escapeHTML(sections[post.section] || sections.journal)}</p></div><div class="managed-actions"><button type="button" data-edit-post="${escapeHTML(post.id)}" data-post-status="${post.status}">Editar</button><button type="button" data-delete-post="${escapeHTML(post.id)}" data-post-status="${post.status}">Eliminar</button></div></article>`).join('');
}

function subscribePosts() {
  if (!configReady) return;
  onValue(ref(database, POST_PATH), snapshot => {
    const data = snapshot.val() || {};
    state.posts = Object.entries(data).map(([id, post]) => ({ ...post, id }));
    renderPosts();
  }, error => console.error('No se pudieron cargar las publicaciones:', error));
}

function subscribeModeratorData() {
  if (!state.user || !configReady) return;
  const unsubscribe = onValue(ref(database, DRAFT_PATH), snapshot => {
    const data = snapshot.val() || {};
    state.drafts = Object.entries(data).map(([id, post]) => ({ ...post, id }));
    renderManagedPosts();
  }, error => showMessage($('#editorMessage'), `No se pudieron cargar los borradores: ${error.message}`, true));
  state.moderatorUnsubscribers.push(unsubscribe);
}

function openPost(postId) {
  const post = state.posts.find(item => item.id === postId);
  if (!post) return;
  $('#readerContent').innerHTML = `<div class="reader-article"><p class="eyebrow">${escapeHTML(post.category)} · ${escapeHTML(sections[post.section] || sections.journal)}</p><h1 id="readerTitle">${escapeHTML(post.title)}</h1><p class="reader-date">Publicado el ${escapeHTML(formatDate(post.publishedAt))}</p>${postMediaMarkup(post, 'reader-hero')}<div class="reader-body">${escapeHTML(post.content || '')}</div></div>`;
  $('#commentMessage').textContent = '';
  $('#commentForm').dataset.postId = post.id;
  if (state.commentUnsubscribe) state.commentUnsubscribe();
  const commentsRef = ref(database, `${COMMENT_PATH}/${post.id}`);
  state.commentUnsubscribe = onValue(commentsRef, snapshot => {
    const comments = Object.values(snapshot.val() || {}).sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    $('#commentsList').innerHTML = comments.length ? comments.map(comment => `<article class="comment-item"><strong>${escapeHTML(comment.author)}</strong><time>${escapeHTML(formatDate(comment.timestamp))}</time><p>${escapeHTML(comment.content)}</p></article>`).join('') : '<p class="comments-intro">Sé la primera persona en comentar.</p>';
  }, error => { $('#commentsList').textContent = `No se pudieron cargar los comentarios: ${error.message}`; });
  openDialog('readerDialog');
}

function stopCommentListener() { if (state.commentUnsubscribe) state.commentUnsubscribe(); state.commentUnsubscribe = null; }

function cleanForm() {
  $('#postForm').reset();
  $('#postForm [name="postId"]').value = '';
  state.selectedMedia = null;
  $('#mediaPreview').innerHTML = '<span>Elige una imagen o un video para la portada</span>';
  $('#cancelEditButton').hidden = true;
  $('#savePostButton').innerHTML = 'Publicar <span>↗</span>';
  showMessage($('#editorMessage'), '');
}

function populateEditor(post) {
  const form = $('#postForm');
  form.elements.postId.value = post.id;
  form.elements.title.value = post.title || '';
  form.elements.category.value = post.category || 'Reflexiones';
  form.elements.section.value = post.section || 'journal';
  form.elements.summary.value = post.summary || '';
  form.elements.content.value = post.content || '';
  form.elements.mediaUrl.value = post.mediaUrl || '';
  form.elements.featured.checked = Boolean(post.featured);
  state.selectedMedia = null;
  const url = safeMediaUrl(post.mediaUrl || '');
  $('#mediaPreview').innerHTML = url ? (post.mediaType === 'video' ? `<video src="${escapeHTML(url)}" controls></video>` : `<img src="${escapeHTML(url)}" alt="Vista previa">`) : '<span>Sin imagen de portada</span>';
  $('#cancelEditButton').hidden = false;
  $('#savePostButton').innerHTML = 'Guardar cambios <span>↗</span>';
  $$('.editor-tab').forEach(tab => tab.classList.toggle('active', tab.dataset.tab === 'writeTab'));
  $$('.editor-pane').forEach(pane => pane.classList.toggle('active', pane.id === 'writeTab'));
  $('#editorDialog').scrollTo({ top: 0, behavior: 'smooth' });
}

async function compressImage(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext('2d');
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise((resolve, reject) => canvas.toBlob(result => result ? resolve(result) : reject(new Error('No se pudo convertir la imagen a WebP.')), 'image/webp', 0.82));
  return new File([blob], `${file.name.replace(/\.[^.]+$/, '') || 'imagen'}.webp`, { type: 'image/webp' });
}

async function uploadMedia(file, postId) {
  let uploadFile = file;
  if (file.type.startsWith('image/')) uploadFile = await compressImage(file);
  const extension = uploadFile.type === 'image/webp' ? 'webp' : uploadFile.type === 'video/webm' ? 'webm' : 'mp4';
  const path = `media/${state.user.uid}/${postId}-${Date.now()}.${extension}`;
  const fileRef = storageRef(storage, path);
  $('#uploadProgress').hidden = false;
  return new Promise((resolve, reject) => {
    const task = uploadBytesResumable(fileRef, uploadFile, { contentType: uploadFile.type });
    task.on('state_changed', snapshot => { $('#uploadProgress').value = snapshot.totalBytes ? snapshot.bytesTransferred / snapshot.totalBytes * 100 : 0; }, reject, async () => {
      try { resolve({ url: await getDownloadURL(task.snapshot.ref), path, type: uploadFile.type.startsWith('video/') ? 'video' : 'image' }); }
      catch (error) { reject(error); }
    });
  }).finally(() => { $('#uploadProgress').hidden = true; $('#uploadProgress').value = 0; });
}

async function savePost(event, publish) {
  event.preventDefault();
  if (!state.user || !configReady) return;
  const form = event.currentTarget;
  const values = new FormData(form);
  const editingId = String(values.get('postId') || '');
  const existing = [...state.posts, ...state.drafts].find(post => post.id === editingId);
  const id = editingId || push(ref(database, publish ? POST_PATH : DRAFT_PATH)).key;
  const message = $('#editorMessage');
  const saveButton = $('#savePostButton');
  saveButton.disabled = true;
  showMessage(message, 'Guardando…');
  try {
    let mediaUrl = String(values.get('mediaUrl') || '').trim();
    let mediaPath = existing?.mediaPath || '';
    let mediaType = existing?.mediaType || '';
    if (state.selectedMedia) {
      const uploaded = await uploadMedia(state.selectedMedia, id);
      mediaUrl = uploaded.url; mediaPath = uploaded.path; mediaType = uploaded.type;
      if (existing?.mediaPath && existing.mediaPath !== mediaPath) deleteObject(storageRef(storage, existing.mediaPath)).catch(() => {});
    } else if (mediaUrl && mediaUrl !== existing?.mediaUrl) {
      if (existing?.mediaPath) deleteObject(storageRef(storage, existing.mediaPath)).catch(() => {});
      mediaType = /\.(mp4|webm)(\?|$)/i.test(mediaUrl) ? 'video' : 'image'; mediaPath = '';
    }
    const post = {
      title: String(values.get('title')).trim(), category: String(values.get('category')),
      section: String(values.get('section')), summary: String(values.get('summary')).trim(),
      content: String(values.get('content')).trim(), mediaUrl: safeMediaUrl(mediaUrl), mediaPath, mediaType,
      featured: form.elements.featured.checked, updatedAt: Date.now(),
      publishedAt: publish ? (existing?.publishedAt || Date.now()) : 0
    };
    if (!post.mediaUrl) {
      if (existing?.mediaPath) deleteObject(storageRef(storage, existing.mediaPath)).catch(() => {});
      post.mediaPath = ''; post.mediaType = '';
    }
    if (publish) {
      await set(ref(database, `${POST_PATH}/${id}`), post);
      await remove(ref(database, `${DRAFT_PATH}/${id}`));
      showMessage(message, 'Publicación guardada. Ya está visible en la página.');
    } else {
      await set(ref(database, `${DRAFT_PATH}/${id}`), post);
      if (existing && state.posts.some(item => item.id === id)) await remove(ref(database, `${POST_PATH}/${id}`));
      showMessage(message, 'Borrador guardado en Firebase.');
    }
    cleanForm();
    $('#editorMessage').textContent = publish ? 'Publicación guardada. Ya está visible en la página.' : 'Borrador guardado en Firebase.';
  } catch (error) {
    showMessage(message, `No se pudo guardar: ${friendlyFirebaseError(error)}`, true);
  } finally { saveButton.disabled = false; }
}

function friendlyFirebaseError(error) {
  const code = error?.code || '';
  if (code.includes('permission-denied') || code.includes('unauthorized')) return 'Firebase rechazó la acción. Revisa las reglas de seguridad y el UID del moderador.';
  if (code.includes('storage/unauthorized')) return 'No tienes permiso para subir archivos. Revisa las reglas de Storage.';
  if (code.includes('storage/quota-exceeded')) return 'Se alcanzó la cuota disponible de almacenamiento.';
  if (code.includes('auth/invalid-credential')) return 'Usuario o contraseña incorrectos.';
  return error?.message || 'Ocurrió un error inesperado.';
}

async function handleLogin(event) {
  event.preventDefault();
  const message = $('#loginMessage');
  if (!configReady) { showMessage(message, 'Falta configurar Firebase y el UID de la cuenta moderadora. Revisa FIREBASE_SETUP.md.', true); return; }
  const values = new FormData(event.currentTarget);
  if (String(values.get('username')).trim().toUpperCase() !== 'ESVA') { showMessage(message, 'Usuario o contraseña incorrectos.', true); return; }
  try {
    const credential = await signInWithEmailAndPassword(auth, moderatorEmail, String(values.get('password')));
    if (credential.user.uid !== moderatorUid) { await signOut(auth); showMessage(message, 'Esta cuenta no está autorizada como moderadora.', true); return; }
    $('#loginForm').reset();
    closeDialog('loginDialog');
    openDialog('editorDialog');
    $('#loginMessage').textContent = '';
    subscribeModeratorData();
  } catch (error) { showMessage(message, friendlyFirebaseError(error), true); }
}

async function deletePost(postId, status) {
  if (!confirm('¿Eliminar esta publicación definitivamente?')) return;
  const post = (status === 'Publicado' ? state.posts : state.drafts).find(item => item.id === postId);
  try {
    await remove(ref(database, `${status === 'Publicado' ? POST_PATH : DRAFT_PATH}/${postId}`));
    if (status === 'Publicado') await remove(ref(database, `${COMMENT_PATH}/${postId}`));
    if (post?.mediaPath) deleteObject(storageRef(storage, post.mediaPath)).catch(() => {});
  } catch (error) { showMessage($('#editorMessage'), `No se pudo eliminar: ${friendlyFirebaseError(error)}`, true); }
}

function bindEvents() {
  $('#currentYear').textContent = new Date().getFullYear();
  $('#moderatorEntry').addEventListener('click', () => { $('#loginMessage').textContent = ''; openDialog(state.user ? 'editorDialog' : 'loginDialog'); });
  $$('[data-close]').forEach(button => button.addEventListener('click', () => closeDialog(button.dataset.close)));
  $$('.dialog').forEach(dialog => dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); }));
  $('#menuToggle').addEventListener('click', event => { const open = $('.main-nav').classList.toggle('open'); event.currentTarget.setAttribute('aria-expanded', String(open)); });
  $$('.main-nav a').forEach(link => link.addEventListener('click', () => $('.main-nav').classList.remove('open')));
  $('#searchInput').addEventListener('input', event => { state.search = event.target.value.trim(); renderPosts(); });
  $('#categoryFilters').addEventListener('click', event => { const button = event.target.closest('[data-filter]'); if (!button) return; state.filter = button.dataset.filter; renderPosts(); });
  $('.topic-list').addEventListener('click', event => {
    const link = event.target.closest('[data-topic]'); if (!link) return;
    const map = { Contabilidad: 'accounting', Tecnología: 'technology', Reflexiones: 'reflections' };
    state.filter = `section:${map[link.dataset.topic]}`; renderPosts();
  });
  document.body.addEventListener('click', event => {
    const openButton = event.target.closest('[data-open-post]');
    if (openButton) {
      if (openButton.classList.contains('post-card') && event.target.closest('video')) return;
      openPost(openButton.dataset.openPost); return;
    }
    const editButton = event.target.closest('[data-edit-post]');
    if (editButton) {
      const collection = editButton.dataset.postStatus === 'Publicado' ? state.posts : state.drafts;
      const post = collection.find(item => item.id === editButton.dataset.editPost);
      if (post) populateEditor(post);
      return;
    }
    const deleteButton = event.target.closest('[data-delete-post]');
    if (deleteButton) deletePost(deleteButton.dataset.deletePost, deleteButton.dataset.postStatus);
  });
  $('#postsGrid').addEventListener('keydown', event => { if (['Enter', ' '].includes(event.key) && event.target.matches('[data-open-post]')) { event.preventDefault(); openPost(event.target.dataset.openPost); } });
  $('#commentForm').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const author = String(values.get('author')).trim().slice(0, 40);
    const content = String(values.get('content')).trim().slice(0, 1000);
    if (!author || !content) return;
    try {
      await set(push(ref(database, `${COMMENT_PATH}/${form.dataset.postId}`)), { author, content, timestamp: Date.now() });
      form.elements.content.value = '';
      showMessage($('#commentMessage'), 'Comentario publicado. ¡Gracias por participar!');
    } catch (error) { showMessage($('#commentMessage'), `No se pudo publicar: ${friendlyFirebaseError(error)}`, true); }
  });
  $('#loginForm').addEventListener('submit', handleLogin);
  $('#postForm').addEventListener('submit', event => savePost(event, true));
  $('#saveDraftButton').addEventListener('click', () => savePost({ preventDefault() {}, currentTarget: $('#postForm') }, false));
  $('#cancelEditButton').addEventListener('click', cleanForm);
  $('#signOutButton').addEventListener('click', async () => { await signOut(auth); closeDialog('editorDialog'); cleanForm(); });
  $$('.editor-tab').forEach(button => button.addEventListener('click', () => {
    $$('.editor-tab').forEach(tab => tab.classList.toggle('active', tab === button));
    $$('.editor-pane').forEach(pane => pane.classList.toggle('active', pane.id === button.dataset.tab));
  }));
  $('#mediaFile').addEventListener('change', event => {
    const file = event.target.files[0]; if (!file) return;
    const isImage = file.type.startsWith('image/');
    const validImage = isImage && ['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(file.type);
    const validVideo = ['video/mp4', 'video/webm'].includes(file.type);
    if (!(validImage || validVideo)) { showMessage($('#editorMessage'), 'Elige JPG, PNG, WebP, AVIF, MP4 o WebM.', true); event.target.value = ''; return; }
    if (file.size > (isImage ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES)) { showMessage($('#editorMessage'), isImage ? 'La imagen supera 12 MB.' : 'El video supera 200 MB.', true); event.target.value = ''; return; }
    state.selectedMedia = file;
    const url = URL.createObjectURL(file);
    $('#mediaPreview').innerHTML = isImage ? `<img src="${url}" alt="Vista previa">` : `<video src="${url}" controls></video>`;
    $('#postForm').elements.mediaUrl.value = '';
  });
  $('#postForm').elements.mediaUrl.addEventListener('input', event => {
    if (state.selectedMedia || !event.target.value) return;
    const url = safeMediaUrl(event.target.value);
    if (!url) return;
    const video = /\.(mp4|webm)(\?|$)/i.test(url);
    $('#mediaPreview').innerHTML = video ? `<video src="${escapeHTML(url)}" controls></video>` : `<img src="${escapeHTML(url)}" alt="Vista previa">`;
  });
  $('#readerDialog').addEventListener('close', stopCommentListener);
  $('#editorDialog').addEventListener('close', () => { if (!state.user) { state.drafts = []; renderManagedPosts(); } });
}

bindEvents();
renderPosts();
if (configReady) {
  subscribePosts();
  onAuthStateChanged(auth, user => {
    state.moderatorUnsubscribers.forEach(unsubscribe => unsubscribe());
    state.moderatorUnsubscribers = [];
    state.user = user?.uid === moderatorUid ? user : null;
    if (state.user) subscribeModeratorData();
  });
}
