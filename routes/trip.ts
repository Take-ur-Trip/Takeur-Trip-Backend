import { Router, Request, Response } from "express";
import query from "../middlewares/db";
import { jwtAuth } from "../middlewares/jwt";
import config from '../config.json';
import decimal2sexagesimalNext from "geolib/es/decimalToSexagesimal";

const router = Router();

router.post('/book', jwtAuth, async (req: Request, res: Response) => {
    try{
        const tokenPayload : any = await res.locals.token as Object; // payload -> logged in User <-> giver
        const {rows : passengerId} = await query(`SELECT "userId" FROM "public.Users" WHERE email LIKE $1`, [tokenPayload.email]);
        const {startLat, startLon, endLat, endLon} = req.query;
        let url = `https://www.google.com/maps/place/${decimal2sexagesimalNext(endLat)},${decimal2sexagesimalNext(endLon)}`;
        console.log(url.replace(/\s/g, ''));

        console.log(passengerId);
        /* 
            TODO:
             *reverse geocode (add -> point) 
        */
       const {rowCount : bookQuery} = await query(`INSERT INTO "public.Trips"("passengerId", "dateOfTrip", "startPoint", "endPoint", status) VALUES($1, NOW(), POINT($2, $3), POINT($4, $5), $6)`, [passengerId[0].userId, startLat, startLon, endLat, endLon, config.tripStatus.booked]);
       if(bookQuery > 0) {
           res.json(config.messages.bookingSuccess);
        } else {
            throw config.messages.bookingError;
        }
    } catch(error) {
        res.json(config.messages.bookingError);
    }
})

router.post('/acceptTrip', jwtAuth, async (req: Request, res: Response) => {
    try {
        //check if logged in user is driver
        const tokenPayload : any = await res.locals.token as Object; // payload -> logged in User <-> giver
        const {rows : isDriverQuery} = await query(`SELECT "userId", "isDriver" FROM "public.Users" WHERE email LIKE $1`, [tokenPayload.email]);
        if(isDriverQuery[0].isDriver) {
            // handle...
            const tripId = req.query.tripId;
            const { rowCount : acceptTripQuery } = await query(`UPDATE "public.Trips" SET "driverId" = $1, status = $2 WHERE "tripId" = $3`, [isDriverQuery[0].userId, config.tripStatus.active, tripId]);
            if(acceptTripQuery < 1) {
                res.json(config.messages.acceptingTripError)
            } else {
                res.json(config.messages.acceptingTripSuccess);
            }
        } else {
            res.json(config.messages.userIsNotDriver);
        }
    } catch(error) {
        console.log(error)
        // error with accepting trip
        res.json(config.messages.acceptingTripError)
    }
})

export default router;