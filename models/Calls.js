const mongoose = require('mongoose');

const callSchema = new mongoose.Schema(
  {
    callerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    receiverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['active', 'ended'], default: 'active' },
    zoomMeetingId: { type: String },
    zoomMeetingLink: { type: String },
    endedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Call', callSchema);
