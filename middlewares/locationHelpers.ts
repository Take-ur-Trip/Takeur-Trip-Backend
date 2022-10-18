export const getDistanceBetweenPoints = (lat1 : number, lng1 : number, lat2 : number, lng2 : number) => {
    // The radius of the planet earth in meters
    let R = 6378137;
    let dLat = degreesToRadians(lat2 - lat1);
    let dLong = degreesToRadians(lng2 - lng1);
    let a = Math.sin(dLat / 2)
        *
        Math.sin(dLat / 2)
        +
        Math.cos(degreesToRadians(lat1))
        *
        Math.cos(degreesToRadians(lat1))
        *
        Math.sin(dLong / 2)
        *
        Math.sin(dLong / 2);
    
    let c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    let distance = Math.ceil(R * c * 0.001 * 1.3);
    
    return distance;
}

export const degreesToRadians = (degrees : number) => degrees * Math.PI / 180;