
const express = require('express')
const upload = require('../config/multer.js')
const { auth } = require('../middleware/authMiddleware');
const router = express.Router();

// Endpoint para subir imagen auth,
router.post('/upload',  upload.single('image'), async (req, res) => {
  try {
    // `req.file.path` es la URL pública de Cloudinary
    const image =  { imageUrl: req.file.path }
    res.json(image);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al subir la imagen' });
  }
});

// export default router
module.exports = router


// const express = require('express');
// const upload = require('../config/multer');
// const Image = require('../models/Image');
// const { auth } = require('../middleware/authMiddleware');

// const router = express.Router();

// /**
//  * SUBIR IMAGEN (usuario autenticado)
//  */

// router.post(
//   '/upload',
//   auth,
//   upload.single('image'),
//   async (req, res) => {
//     try {
//       const image = await Image.create({
//         user: req.user.id,
//         imageUrl: req.file.path,
//         public_id: req.file.filename,
//       });
//       console.log('this is the uploaded url:', image)

//       res.json(image);
//     } catch (error) {
//       console.error(error);
//       res.status(500).json({ message: 'Error al subir la imagen' });
//     }
//   }
// );

// module.exports = router;
