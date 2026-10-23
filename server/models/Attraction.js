import mongoose from 'mongoose'

// Saved "popular places" per destination, so each destination is only looked up once
const attractionSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true }, // destination in lowercase
  items: { type: [mongoose.Schema.Types.Mixed], default: [] }, // [{ name, type, indoor, address }]
  fetchedAt: { type: Date, default: Date.now },
  fallback: { type: Boolean, default: false } // true = OpenStreetMap was down, so the list came from Wikipedia
})

export default mongoose.model('Attraction', attractionSchema)
