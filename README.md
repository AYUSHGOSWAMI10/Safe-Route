# SafeRoute

Risk-Aware Route Planning System

SafeRoute is a small college project prototype that compares routes using travel time, distance, and a basic safety score.

## Current MVP

- React frontend
- Node.js and Express API
- MongoDB road model with sample roads
- Sample data fallback when MongoDB is not running
- Faster, Balanced, and Safer route preferences
- Route comparison and a recommended route

The road network and scores are fictional. **Safety scores are estimated using sample data and do not guarantee real-world safety.**

## Run locally

You need Node.js and npm. MongoDB is optional for the sample-data demo.

1. Install the project dependencies:

   ```bash
   npm install
   npm run install:all
   ```

2. (Optional) Configure MongoDB by copying `.env.example` to `server/.env` and setting `MONGODB_URI`. Start your local MongoDB service first. If MongoDB is unavailable, the API uses the sample roads automatically.

3. Start the frontend and backend in development mode:

   ```bash
   npm run dev
   ```

4. Open the Vite URL shown in the terminal, usually http://localhost:5173.

To start only the backend, run `npm start --prefix server`. The API listens on port 5000 by default.

## API

- `GET /api/routes` returns the available sample locations.
- `POST /api/routes/find` accepts `{ "source", "destination", "preference" }` and returns up to three route options and the recommendation.

## Future improvements

- OpenStreetMap and a real road network
- A* pathfinding
- Better, dynamic risk scores
- Real incident, lighting, traffic, and activity data
- Time-dependent risk and user reports
- Mobile application
