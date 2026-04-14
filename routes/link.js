const express = require('express');
const router = express.Router();
const Link = require('../models/Link');

const { auth } = require('../middleware/authMiddleware');

// 🔗 GET LINK POR KEY
router.get('/link/:key', auth, async (req, res) => {
  try {
    const { key } = req.params;

    // let query = {
    //   key: key.toUpperCase(),
    //   active: true
    // };

    // // 👤 Si NO es admin → solo link activo (ya cubierto arriba)
    // // 👑 Si es admin → podría ver incluso inactivos
    // if (req.user.role === 'admin') {

    //   delete query.active; // admin ve todos
    // }
    const isAdmin = req.user.role === 'admin'
    const query = {
      key: key.toUpperCase(),
      ...( isAdmin ? {} : { active: true })
    }

    const link = await Link.findOne(query);

    if (!link) {
      return res.status(404).json({ message: 'Link no encontrado' });
    }

    res.json(link);

  } catch (error) {
    res.status(500).json({ message: 'Error obteniendo link' });
  }
});

module.exports = router;