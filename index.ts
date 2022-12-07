import bodyParser from "body-parser";
import express from "express";
require('dotenv').config();
import cors from "cors";
import { createServer } from "http";

const port = process.env.PORT || 8080;
const App = express();
const httpServer = createServer(App);


//Middlewares
App.use(bodyParser.json())
App.use(cors({
    'allowedHeaders': ['sessionId', 'Content-Type', 'Authorization', 'authorization'],
    'exposedHeaders': ['sessionId'],
    'methods': 'GET,HEAD,PUT,PATCH,POST,DELETE',
    'credentials': false,
    'preflightContinue': false
  }));
// Routes
import userRoutes from './routes/users';
import ratingRoutes from './routes/rating';
import tripRoutes from './routes/trip';
import loggerRoutes from './routes/logger/logger';
App.use('/users', userRoutes);
App.use('/rating', ratingRoutes);
App.use('/trip', tripRoutes);
App.use('/logs', loggerRoutes);

httpServer.listen(port, () => {
    console.log(`Server is listening on port: ${port}`);
});

