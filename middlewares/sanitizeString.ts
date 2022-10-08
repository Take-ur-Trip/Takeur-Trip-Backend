export const sanitizeString = async (obj : any) => {
    for(const data in obj) {
        obj[data] = obj[data].toString();
    }
}