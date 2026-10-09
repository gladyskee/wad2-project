import mongoose from 'mongoose'

const tripSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 80 },
  destination: { type: String, required: true, trim: true, maxlength: 80 },
  startDate: { type: String, default: '' }, // 'YYYY-MM-DD' (a string avoids timezone shifts)
  endDate: { type: String, default: '' },
  travellers: [{ type: String, trim: true, maxlength: 40 }],

  // Itinerary: validated and cleaned in routes/trips.js before saving
  // stop = { id, name, address|null, date 'YYYY-MM-DD', hour, duration|null, outdoor, locked }
  stops: { type: [mongoose.Schema.Types.Mixed], default: [] },
  // wishlist item = { id, name, address|null }  (indoor backups for rainy days)
  wishlist: { type: [mongoose.Schema.Types.Mixed], default: [] }
}, { timestamps: true })

export default mongoose.model('Trip', tripSchema)