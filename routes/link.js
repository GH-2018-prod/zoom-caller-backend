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

// 🔗 CREAR LINK (solo admin)
router.post('/link', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Acceso denegado: se requiere rol admin' });
    }

    const { key, url, title, active } = req.body;

    if (!key || !url) {
      return res.status(400).json({ message: 'key y url son obligatorios' });
    }

    const existing = await Link.findOne({ key: key.toUpperCase().trim() });
    if (existing) {
      return res.status(400).json({ message: 'Ya existe un link con ese nivel' });
    }

    const link = await Link.create({
      key: key.trim(),
      url: url.trim(),
      title: title?.trim() || '',
      active: active ?? true,
    });

    res.status(201).json(link);

  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: 'Error creando link'
    });
  }
});


// 🔗 ACTUALIZAR LINK (solo admin)
router.put('/link/:id', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Acceso denegado: se requiere rol admin' });
    }

    const { id } = req.params;
    const { key, url, title, active } = req.body;

    if (key) {
      const existing = await Link.findOne({
        key: key.toUpperCase().trim(),
        _id: { $ne: id },
      });
      if (existing) {
        return res.status(400).json({ message: 'Ya existe un link con ese nivel' });
      }
    }

    const update = {};
    if (key !== undefined) update.key = key.trim();
    if (url !== undefined) update.url = url.trim();
    if (title !== undefined) update.title = title.trim();
    if (active !== undefined) update.active = active;

    const link = await Link.findByIdAndUpdate(id, update, {
      new: true,
      runValidators: true,
    });

    if (!link) {
      return res.status(404).json({ message: 'Link no encontrado' });
    }

    res.json(link);

  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: 'Error actualizando link'
    });
  }
});


// 🔗 BORRAR LINK (solo admin)
router.delete('/link/:id', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Acceso denegado: se requiere rol admin' });
    }

    const { id } = req.params;
    const deleted = await Link.findByIdAndDelete(id);

    if (!deleted) {
      return res.status(404).json({ message: 'Link no encontrado' });
    }

    res.json({ message: 'Link eliminado correctamente' });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: 'Error eliminando link'
    });
  }
});


module.exports = router;