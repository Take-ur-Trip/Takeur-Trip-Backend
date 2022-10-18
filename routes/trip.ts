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
        // let url = `https://www.google.com/maps/place/${decimal2sexagesimalNext(endLat)},${decimal2sexagesimalNext(endLon)}`;
        // console.log(url.replace(/\s/g, ''));
        
        /* 
            TODO:
             *reverse geocode (add -> point) 
        */
       const {rowCount : bookQuery} = await query(`INSERT INTO "public.Trips"("passengerId", "dateOfBook", "startPoint", "endPoint", status) VALUES($1, NOW(), POINT($2, $3), POINT($4, $5), $6)`, [passengerId[0].userId, startLat, startLon, endLat, endLon, config.tripStatus.booked]);
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
        const {rows : driverQuery} = await query(`SELECT "userId", "isDriver" FROM "public.Users" WHERE email LIKE $1`, [tokenPayload.email]);
        const tripId = req.query.tripId;
        if(driverQuery[0].isDriver) {
            // handle...
            const { rows : tripQuery } = await query(`SELECT status, "driverId", "passengerId", "startPoint", "endPoint" FROM "public.Trips" WHERE "tripId" = $1`, [tripId as string]);
            if(tripQuery[0].status == config.tripStatus.active) {
                res.json(config.messages.tripAlreadyAccepted);
            } else {
                if(tripQuery[0].passengerId == driverQuery[0].userId) {
                    res.json(config.messages.cannotAcceptSelfTrip)
                } else {
                    const { rowCount : acceptTripQuery } = await query(`UPDATE "public.Trips" SET "driverId" = $1, status = $2, "dateOfAccept" = NOW() WHERE "tripId" = $3`, [driverQuery[0].userId, config.tripStatus.active, tripId]);
                    if(acceptTripQuery < 1) {
                        res.json(config.messages.acceptingTripError)
                    } else {
                        res.json({...config.messages.acceptingTripSuccess, ...{startPoint: tripQuery[0].startPoint}, ...{endPoint:tripQuery[0].endPoint}});
                    }
                }
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

router.get('/fetch', jwtAuth, async (req : Request, res: Response) => {
    try {
        const { rows : trips} = await query(`SELECT * FROM "public.Trips"`, []);
        res.json(trips);
    } catch(err) { 
        res.json(config.messages.tripFetchingError);
    }
})

router.get('/fetch/:id', jwtAuth, async (req : Request, res: Response) => {
    try {
        const tripId = req.params.id;
        const { rows : trips} = await query(`SELECT * FROM "public.Trips" WHERE "tripId" = $1`, [tripId]);
        res.json(trips);
    } catch(err) { 
        res.json(config.messages.tripFetchingError);
    }
})

export default router;