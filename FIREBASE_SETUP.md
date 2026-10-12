# Configuración de Firebase para el blog

La página ya está enlazada al proyecto Firebase `esandovalvelille-blog` y al UID moderador proporcionado. La contraseña no está guardada en el código. Completa una vez estos ajustes de consola para que el panel publique en la nube.

## 1. Crear y configurar el proyecto

1. En [Firebase Console](https://console.firebase.google.com/), abre el proyecto `esandovalvelille-blog` y confirma que Authentication tenga habilitado **Correo electrónico/contraseña**, que la cuenta moderadora exista con el UID configurado y que el dominio donde publiques la web aparezca en **Authentication → Settings → Authorized domains**.
2. Confirma que Realtime Database esté inicializada con la URL que ya está en `assets/js/firebase-config.js`.
3. En Realtime Database → **Rules**, publica el contenido de `database.rules.json`.
4. En Storage, crea/confirma el bucket indicado en la configuración web y publica el contenido de `storage.rules` en la pestaña **Rules**.

Después de esos pasos, abre la web con un servidor local o desplegada en Hosting, pulsa **Acceso editorial** e ingresa con el usuario visible `ESVA` y la contraseña de la cuenta Firebase. Las publicaciones y medios se gestionan desde esa interfaz.

## 2. Importante sobre almacenamiento y costos

Desde el 3 de febrero de 2026, Cloud Storage for Firebase requiere el plan Blaze con facturación vinculada. Blaze es de pago por uso: revisa las tarifas y configura alertas de presupuesto antes de subir videos. Las imágenes se convierten a WebP en el navegador; MP4 y WebM se suben sin conversión, con límite de 200 MB por archivo en la interfaz.

## 3. Ejecutar localmente

Como el sitio carga módulos JavaScript, ábrelo mediante un servidor local, no con `file://`. Por ejemplo, desde esta carpeta puedes usar la extensión Live Server de VS Code. Las lecturas públicas requieren que Realtime Database tenga las reglas de `database.rules.json` aplicadas. Los comentarios aceptan apodo y texto, sin cuenta de lector.

## Datos

- `publishedPosts/{id}`: publicaciones visibles.
- `drafts/{id}`: borradores privados del UID moderador.
- `postComments/{postId}/{commentId}`: comentarios públicos asociados a una publicación.
- `media/{uid}/{filename}`: archivos en Cloud Storage; las reglas permiten lectura pública y escritura solo del UID moderador.
