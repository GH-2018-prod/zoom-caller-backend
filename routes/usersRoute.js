const express = require('express')
const router = express.Router()
const {  getUsers, updateUser, deleteUser } = require('../controllers/userController')
const { protect } = require('../middleware/usersMiddleware');
const { adminOnly } = require('../middleware/roleMiddleware');

router.get('/', protect, adminOnly, getUsers)
//router.get('/:id', protect, adminOnly, updateUser)
router.put('/edit/:id', protect, adminOnly, updateUser)
router.delete('/delete/:id', protect, adminOnly, deleteUser)

module.exports = router