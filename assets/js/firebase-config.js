// Configuración web del proyecto personal ES Sandoval.
// Los permisos reales los aplican Authentication y las reglas de Firebase.
export const firebaseConfig = {
  apiKey: 'AIzaSyC6xkjPTJOYTgsgIvK4rw6AYenrOubXk6I',
  authDomain: 'esandovalvelille-blog.firebaseapp.com',
  databaseURL: 'https://esandovalvelille-blog-default-rtdb.firebaseio.com',
  projectId: 'esandovalvelille-blog',
  storageBucket: 'esandovalvelille-blog.firebasestorage.app',
  messagingSenderId: '945360024239',
  appId: '1:945360024239:web:8689e34ffd2b7a9dffda5a',
  measurementId: 'G-T96BRT5X56'
};

// Authentication usa este email; el formulario muestra el identificador ESVA.
// El UID limita el acceso también en las reglas del servidor.
export const moderatorEmail = 'esandoval.velille.pe@gmail.com';
export const moderatorUid = 'XLC0hANEMpRewmMyxP0eTw8LGdl1';
