const express = require('express');
const router = express.Router();

const Link = require('../models/Link');
const { auth } = require('../middleware/authMiddleware');


// 🔗 GET TODOS LOS LINKS
router.get('/link', auth, async (req, res) => {
  try {

    const isAdmin = req.user.role === 'admin';

    const query = isAdmin
      ? {}
      : { active: true };

    const links = await Link.find(query)
      .sort({ createdAt: -1 });

    res.json(links);

  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: 'Error obteniendo links'
    });
  }
});


// 🔗 GET LINK POR KEY
router.get('/link/:key', auth, async (req, res) => {
  try {

    const { key } = req.params;

    const isAdmin = req.user.role === 'admin';

    const query = {
      key: key.toUpperCase(),
      ...(isAdmin ? {} : { active: true })
    };

    const link = await Link.findOne(query);

    if (!link) {
      return res.status(404).json({
        message: 'Link no encontrado'
      });
    }

    res.json(link);

  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: 'Error obteniendo link'
    });
  }
});

module.exports = router;


// const express = require('express');
// const router = express.Router();
// const Link = require('../models/Link');
// const { auth } = require('../middleware/authMiddleware');

// // 🔗 GET LINK POR KEY
// router.get('/link/:key', auth, async (req, res) => {
//   try {
//     const { key } = req.params;
//     const isAdmin = req.user.role === 'admin'
//     const query = {
//       key: key.toUpperCase(),
//       ...( isAdmin ? {} : { active: true })
//     }
//     const link = await Link.findOne(query);

//     if (!link) {
//       return res.status(404).json({ message: 'Link no encontrado' });
//     }
//     res.json(link);
//   } catch (error) {
//     res.status(500).json({ message: 'Error obteniendo link' });
//   }
// });

// module.exports = router;