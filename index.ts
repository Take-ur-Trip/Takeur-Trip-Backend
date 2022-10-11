import bodyParser from "body-parser";
import express from "express";
require('dotenv').config();

const port = process.env.SERVER_PORT || 8001;
const App = express();

//Middlewares
App.use(bodyParser.json())

// Routes
import userRoutes from './routes/users';
import ratingRoutes from './routes/rating';
App.use('/users', userRoutes);
App.use('/rate', ratingRoutes);

App.listen(port, () => {
    console.log(`Server is listening on port: ${port}`);
});

