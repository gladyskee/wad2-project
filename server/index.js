import dotenv from 'dotenv'
dotenv.config()
import express from 'express'
import cors from 'cors'
import mongoose from 'mongoose'
import authRoutes from './routes/auth.js'
import crowdRoutes from './routes/crowd.js'
import preferenceRoutes from './routes/preferences.js'
import User from './models/User.js'

import tripRoutes from './routes/trips.js'
app.use('/api/trips', tripRoutes)

const app = express()
app.use(cors())
app.use(express.json())

// Routes
app.use('/api/auth', authRoutes)
app.use('/api/crowd', crowdRoutes)
app.use('/api/preferences', preferenceRoutes)

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' })
})

// Catch any unexpected error so the server doesn't crash
// (Express 5 sends errors from async routes here automatically)
app.use((err, req, res, next) => {
  console.error(err)
  res.status(500).json({ message: 'Something went wrong on the server.' })
})

// Connect to MongoDB, then start the server
const PORT = process.env.PORT || 3000

mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log('Connected to MongoDB')
    // Make the database's indexes match the User model
    // (adds the unique username/email rules and removes any old ones)
    await User.syncIndexes()
    app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`))
  })
  .catch((err) => {
    console.error('Could not connect to MongoDB:', err.message)
    process.exit(1)
  })
