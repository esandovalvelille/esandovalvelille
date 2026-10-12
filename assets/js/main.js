// ==========================================
// CONFIGURACIÓN DE TU NUEVO PROYECTO FIREBASE
// ==========================================
const firebaseConfig = {
    apiKey: "AIzaSyB_TU_TOKEN_REAL_AQUI_2026",
    authDomain: "esandovalvelille-blog.firebaseapp.com",
    databaseURL: "https://esandovalvelille-blog-default-rtdb.firebaseio.com",
    projectId: "esandovalvelille-blog",
    storageBucket: "esandovalvelille-blog.firebasestorage.app"
};

// Inicialización de Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const postsRef = db.ref('blog_posts');
const commentsRef = db.ref('post_comments');

let loadedPosts = [];
let activePostIdForComments = null;

// ==========================================
// INICIALIZACIÓN DE LA APLICACIÓN
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    initRealtimeListener();
    setupAdminSecretShortcut();
    setupGuestIdentityPreview();
});

// Escuchar cambios en tiempo real
function initRealtimeListener() {
    postsRef.on('value', (snapshot) => {
        const data = snapshot.val();
        if (data) {
            loadedPosts = Object.values(data);
            loadedPosts.sort((a, b) => b.timestamp - a.timestamp);
            renderAllSections(loadedPosts);
        } else {
            renderAllSections([]);
        }
    });
}

// Renders dinámicos según el área de destino
function renderAllSections(posts) {
    const containerAccounting = document.getElementById('gridAccounting');
    const containerTech = document.getElementById('gridTechEngine');
    const containerBlog = document.getElementById('feedBlogGeneral');

    if (containerAccounting) containerAccounting.innerHTML = '';
    if (containerTech) containerTech.innerHTML = '';
    if (containerBlog) containerBlog.innerHTML = '';

    posts.forEach(post => {
        const isVideo = post.coverImage && (post.coverImage.endsWith('.mp4') || post.coverImage.endsWith('.webm'));
        
        let mediaHTML = '';
        if (post.coverImage) {
            mediaHTML = isVideo 
                ? `<video src="${post.coverImage}" class="post-media-preview" autoplay loop muted playsinline></video>`
                : `<img src="${post.coverImage}" class="post-media-preview" alt="${post.title}">`;
        }

        const cardHTML = `
            <article class="post-card-item" onclick="openReaderModal('${post.id}')">
                ${mediaHTML}
                <div class="post-category-tag">${post.category}</div>
                <h4 class="post-card-title">${post.title}</h4>
                <p class="post-card-summary">${post.summary}</p>
            </article>
        `;

        if (post.sectionTarget === 'accounting_ops' && containerAccounting) {
            containerAccounting.insertAdjacentHTML('beforeend', cardHTML);
        } else if (post.sectionTarget === 'cpp_engine' && containerTech) {
            containerTech.insertAdjacentHTML('beforeend', cardHTML);
        } else if (containerBlog) {
            containerBlog.insertAdjacentHTML('beforeend', cardHTML);
        }
    });
}

// Abrir Lector de Artículos
window.openReaderModal = function(postId) {
    const post = loadedPosts.find(p => p.id === postId);
    if (!post) return;

    activePostIdForComments = postId;
    const body = document.getElementById('readerArticleBody');
    const isVideo = post.coverImage && (post.coverImage.endsWith('.mp4') || post.coverImage.endsWith('.webm'));

    let mediaHeader = '';
    if (post.coverImage) {
        mediaHeader = isVideo 
            ? `<video src="${post.coverImage}" style="width:100%; border-radius:8px; margin:16px 0;" autoplay loop muted playsinline></video>`
            : `<img src="${post.coverImage}" style="width:100%; border-radius:8px; margin:16px 0;" alt="${post.title}">`;
    }

    body.innerHTML = `
        <span style="color:var(--accent-color); font-size:0.85rem; font-weight:600; text-transform:uppercase;">${post.category}</span>
        <h1 style="font-family: var(--font-head); font-size: 2.2rem; margin: 8px 0;">${post.title}</h1>
        <small style="color:var(--text-muted); display:block; margin-bottom:12px;">Publicado el ${new Date(post.timestamp).toLocaleDateString()}</small>
        ${mediaHeader}
        <div style="font-size:1.05rem; line-height:1.7; margin-top:20px;">${post.contentMarkdown}</div>
    `;

    document.getElementById('postReaderModal').classList.add('active');
    listenCommentsForPost(postId);
};

document.getElementById('closeReaderModal').addEventListener('click', () => {
    document.getElementById('postReaderModal').classList.remove('active');
});

// ==========================================
// COMPRESIÓN DE IMÁGENES CLIENT-SIDE A WEBP
// ==========================================
async function compressImageToWebP(file, maxWidth = 1280, quality = 0.78) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                let width = img.width;
                let height = img.height;

                if (width > maxWidth) {
                    height = Math.round((height * maxWidth) / width);
                    width = maxWidth;
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                ctx.drawImage(img, 0, 0, width, height);

                canvas.toBlob((blob) => {
                    if (blob) {
                        resolve(canvas.toDataURL('image/webp', quality));
                    } else {
                        reject(new Error("Error en la conversión a Canvas Blob"));
                    }
                }, 'image/webp', quality);
            };
            img.onerror = (error) => reject(error);
        };
    });
}

// ==========================================
// SISTEMA DE COMENTARIOS SIN INICIO DE SESIÓN
// ==========================================
function setupGuestIdentityPreview() {
    const inputAuthor = document.getElementById('commentAuthorInput');
    const avatarImg = document.getElementById('guestAvatarPreview');

    const saved = JSON.parse(localStorage.getItem('esva_blog_guest'));
    if (saved) {
        inputAuthor.value = saved.name;
        avatarImg.src = saved.avatar;
    }

    inputAuthor.addEventListener('input', (e) => {
        const val = e.target.value.trim();
        if (val.length > 0) {
            avatarImg.src = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(val)}`;
        }
    });
}

document.getElementById('formAddComment').addEventListener('submit', (e) => {
    e.preventDefault();
    if (!activePostIdForComments) return;

    const author = document.getElementById('commentAuthorInput').value.trim();
    const text = document.getElementById('commentTextInput').value.trim();
    const avatarUrl = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(author)}`;
    
    localStorage.setItem('esva_blog_guest', JSON.stringify({ name: author, avatar: avatarUrl }));

    commentsRef.child(activePostIdForComments).push({
        authorName: author,
        avatarUrl: avatarUrl,
        content: text,
        timestamp: Date.now()
    }, (err) => {
        if (!err) document.getElementById('commentTextInput').value = '';
    });
});

function listenCommentsForPost(postId) {
    commentsRef.child(postId).on('value', (snapshot) => {
        const data = snapshot.val();
        const container = document.getElementById('commentsContainerFeed');
        container.innerHTML = '';

        if (!data) {
            container.innerHTML = '<p style="color:var(--text-muted); font-size:0.85rem; margin-top:12px;">Sin comentarios aún. ¡Sé el primero!</p>';
            return;
        }

        Object.values(data).reverse().forEach(c => {
            container.innerHTML += `
                <div style="display:flex; gap:12px; margin-top:16px; background:#0e0e11; padding:12px; border-radius:8px;">
                    <img src="${c.avatarUrl}" style="width:36px; height:36px; border-radius:50%;">
                    <div>
                        <strong style="font-size:0.85rem; color:var(--accent-color);">${c.authorName}</strong>
                        <p style="font-size:0.88rem; color:var(--text-primary); margin-top:2px;">${c.content}</p>
                    </div>
                </div>
            `;
        });
    });
}

// ==========================================
// GESTOR CMS ADMINISTRATIVO
// ==========================================
document.getElementById('formCMSPost').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const title = document.getElementById('cmsTitle').value.trim();
    const category = document.getElementById('cmsCategory').value;
    const sectionTarget = document.getElementById('cmsSectionTarget').value;
    const summary = document.getElementById('cmsSummary').value.trim();
    const content = document.getElementById('cmsContent').value.trim();
    
    const fileInput = document.getElementById('cmsFileInput');
    let mediaUrl = document.getElementById('cmsMediaUrl').value.trim();

    if (fileInput.files.length > 0) {
        const file = fileInput.files[0];
        if (file.type.startsWith('image/')) {
            mediaUrl = await compressImageToWebP(file);
        }
    }

    const postId = postsRef.push().key;
    postsRef.child(postId).set({
        id: postId,
        title,
        category,
        sectionTarget,
        summary,
        contentMarkdown: content,
        coverImage: mediaUrl,
        timestamp: Date.now()
    }, (err) => {
        if (!err) {
            alert("✅ Artículo publicado exitosamente.");
            document.getElementById('formCMSPost').reset();
            document.getElementById('adminCMSModal').classList.remove('active');
        }
    });
});

function setupAdminSecretShortcut() {
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'm') {
            document.getElementById('adminCMSModal').classList.add('active');
        }
    });
}

document.getElementById('closeCMSModal').addEventListener('click', () => {
    document.getElementById('adminCMSModal').classList.remove('active');
});