import express from 'express';
import SavedRoute from '../models/transport.js';
import { requireAuth } from './auth.js';
import { findTripFor } from '../tripAccess.js';
const router = express.Router();

// different transport modes
const MODES = [
    { mode: 'TRANSIT', allowedModes: ['BUS', 'SUBWAY', 'TRAIN'], fallbackType: 'Bus & Train' },
    { mode: 'TRANSIT', allowedModes: ['BUS'], fallbackType: 'Bus' },
    { mode: 'TRANSIT', allowedModes: ['SUBWAY', 'TRAIN'], fallbackType: 'Train / MRT' },
    { mode: 'DRIVE', fallbackType: 'Taxi / Car' },
    { mode: 'WALK', fallbackType: 'Walk' }
];

// convert string into a number
function parseMinutes(durationStr) {
    if (!durationStr) {
        return 0;
    }
    const seconds = parseInt(durationStr.replace('s', ''), 10) || 0;
    return Math.round(seconds / 60);
}

// from google routes api, access and get the required fields
async function fetchMode(origin, destination, { mode, allowedModes, fallbackType }, timeOpts = {}) {
    const KEY = process.env.GOOGLE_MAPS_API_KEY;
    if (!KEY) {
        console.error('❌ GOOGLE_MAPS_API_KEY is missing in process.env!');
        return null;
    }

    const endpoint = 'https://routes.googleapis.com/directions/v2:computeRoutes';

    // combine what every request needs
    const payload = {
        origin: { address: origin },
        destination: { address: destination },
        travelMode: mode
    };

    // runs when the mode is transit and allowedModes provided
    if (mode === 'TRANSIT' && allowedModes) {
        payload.transitPreferences = {
            allowedTravelModes: allowedModes
        };
    }

    // get ISO time and type (depart/arrive)
    const { time, timeType } = timeOpts;   

    if (time) {
        if (mode === 'TRANSIT') {
            // set as arrive/departure time 
            if (timeType === 'arrive') {
                payload.arrivalTime = time;
            } else {
                payload.departureTime = time;
            }
        } else if (mode === 'DRIVE' && timeType !== 'arrive') { 
            payload.departureTime = time;
            payload.routingPreference = 'TRAFFIC_AWARE';   // needed for the time to affect the estimate
        }
    }

    try {
        // send the request and wait for google’s reply
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',  // JSON file
                'X-Goog-Api-Key': KEY, 
                'X-Goog-FieldMask': 'routes.duration,routes.description,routes.travelAdvisory.transitFare,routes.legs.steps' // list wanted fields
            },
            body: JSON.stringify(payload) 
        });

        // reads response and convert to object 
        const json = await res.json();

        // check whether request succeeded
        if (!res.ok || json.error) {
            return null;
        }

        // takes first route; if json.routes does not exist, route is undefined
        const route = json.routes?.[0];
        if (!route) {
            return null;
        }
        const totalMinutes = parseMinutes(route.duration);

        let dynamicType = fallbackType;
        let description = 'Direct';
        let signature = fallbackType;

        if (mode === 'TRANSIT') {
            const steps = route.legs?.[0]?.steps || [];
            const routeSegments = [];
            const lineSignature = [];

            let hasBus = false;
            let hasTrain = false;
            let walkSeconds = 0;

            // get total walking time 
            const flushWalk = () => {
                if (walkSeconds > 0) {
                    const mins = Math.max(Math.round(walkSeconds / 60), 1);
                    routeSegments.push(`Walk (${mins} mins)`);
                    walkSeconds = 0;
                }
            };

            for (const step of steps) {

                if (step.transitDetails) {
                    flushWalk(); // close off any walking before this transit step
                    const details = step.transitDetails;
                    const line = details.transitLine || {};
                    const vehicleType = line.vehicle?.type || 'BUS';
                    const lineName = line.nameShort || line.name || 'Transit';
                    const stopCount = details.stopCount || 0;

                    const isTrainType = ['SUBWAY', 'TRAIN', 'HEAVY_RAIL', 'METRO_RAIL', 'COMMUTER_TRAIN', 'MONORAIL', 'TRAM'].includes(vehicleType);

                    if (isTrainType) {
                        hasTrain = true;
                    } else {
                        hasBus = true;
                    }

                    const label = isTrainType ? 'Train' : 'Bus';
                    const stopsText = stopCount > 0 ? ` (${stopCount} stop${stopCount > 1 ? 's' : ''})` : '';

                    // Transit step: shows line name and stop count only
                    routeSegments.push(`${label} ${lineName}${stopsText}`);
                    lineSignature.push(`${label}:${lineName}`);  
                } else if (step.travelMode === 'WALK') {
                    // show even very short walks as at least 1 min
                    walkSeconds += parseInt((step.staticDuration || '0').replace('s', ''), 10) || 0;
                }
            }

            flushWalk(); // walking at the very end of the trip

            // Only walking (no bus or train at all) is not a transit option: the Walk row covers it
            if (!hasBus && !hasTrain) {
                return null;
            }

            if (hasBus && hasTrain) {
                dynamicType = 'Bus & Train';
            } else if (hasTrain) {
                dynamicType = 'Train / MRT';
            } else if (hasBus) {
                dynamicType = 'Bus';
            }

            description = routeSegments.length ? routeSegments.join(' → ') : 'Public transport';
            signature = lineSignature.join('>') || dynamicType;  

        } else if (mode === 'DRIVE') {
            description = route.description ? `Via ${route.description}` : 'Direct route';
        } else {
            description = 'On foot';
        }

        // fare calculation
        let cost = null;
        let currency = null;

        if (mode === 'TRANSIT') {
            const transitFare = route.travelAdvisory?.transitFare?.transitFare;
            if (transitFare) {
                // money format into one normal decimal number; dollars + fractional part
                cost = parseFloat(transitFare.units || 0) + (transitFare.nanos ? transitFare.nanos / 1e9 : 0);
                currency = transitFare.currencyCode || null;
            }
        } else if (mode === 'WALK') {
            cost = 0;
        }

        return { type: dynamicType, route: description, duration: totalMinutes, cost, currency, signature };
    } catch (error) {
        console.error(`❌ Fetch failed for mode [${mode}]:`, error.message);
        return null;
    }
}

// fetch route options from Google
router.get('/', requireAuth, async (req, res) => {
    const { origin, destination, time, timeType } = req.query;
    
    if (!origin || !destination) {
        return res.status(400).json({ error: 'origin and destination are required' });
    }

    // valid time 
    let timeOpts = {};
    if (time) {
        const d = new Date(time);
        if (isNaN(d.getTime())) {
            return res.status(400).json({ error: 'Invalid time' });
        }
        timeOpts = { time: d.toISOString(), timeType: timeType === 'arrive' ? 'arrive' : 'depart' };
    }

    try {
        // fetch all modes
        const rawResults = await Promise.all(MODES.map(m => fetchMode(origin, destination, m, timeOpts)));
        // removing failed results
        const valid = rawResults.filter(Boolean);

        // keep unique & fastest route
        const best = new Map();

        for (const item of valid) {
            const existing = best.get(item.signature);
            if (!existing || item.duration < existing.duration) {
                best.set(item.signature, item);
            }
        }
        // turns map's values into normal array 
        const unique = [...best.values()].map(({ signature, ...rest }) => rest);
        res.json(unique);
    } catch (error) {
        console.error('Directions route error:', error);
        res.status(500).json({ error: 'Failed to get directions' });
    }
});

// read the saved routes from the database
router.get('/saved', requireAuth, async (req, res) => {
    try {
        const tripId = req.query.tripId;

        if (!tripId) {
            return res.status(400).json({error: 'tripId is required'});
        }
        // only people on the trip can see its routes
        if (!await findTripFor(req.userId, tripId)) {
            return res.status(404).json({error: 'Trip not found'});
        }

        const savedRoutes = await SavedRoute.findByTripId(tripId);
        res.json(savedRoutes);
    } catch(error) {
        console.error('Error fetching saved routes:', error);
        res.status(500).json({error: 'Failed to fetch saved routes'});
    }
});

//  save or unsave one route option
router.post('/toggle', requireAuth, async (req, res) => {
    const tripId = req.body.tripId;
    const start = req.body.start;
    const end = req.body.end;
    const option = req.body.option;

    if (!tripId || !start || !end || !option){
        return res.status(400).json({error: 'Missing required parameters'});
    }
    // only people on the trip can save its routes
    if (!await findTripFor(req.userId, tripId)) {
        return res.status(404).json({error: 'Trip not found'});
    }

    try {
        const result = await SavedRoute.toggleOption({ tripId, start, end, option });
        res.json(result);
    } catch(error) {
        console.error('Error unsaving route:', error);
        res.status(500).json({error: 'Failed to unsaved route'});
    }
});

export default router;

