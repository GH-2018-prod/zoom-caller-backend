const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('./cloudinary');

// const storage = new CloudinaryStorage({
//   cloudinary,
//   params: {
//     folder: 'mern_uploads',
//     allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
//   }
// });

// params: async (req, file) => ({
//   folder: 'mern_uploads',
//   format: file.mimetype.split('/')[1],
// });

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'mern_uploads',
    resource_type: 'image',
    //format: file.mimetype.split('/')[1],
  },
});

const upload = multer({ storage });

module.exports = upload;
