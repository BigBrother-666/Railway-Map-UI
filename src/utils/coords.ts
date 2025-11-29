import L from 'leaflet';
import { mapConfig } from '../constants/config.ts';

export type RasterCoords = {
    project(latlng: L.LatLng): L.Point;
    unproject(coords: [number, number]): L.LatLng;
    getMaxBounds(): L.LatLngBounds;
    zoomLevel(): number;
};

let rasterCoordsInstance: RasterCoords | null = null;

export function setRasterCoords(rc: RasterCoords) {
    rasterCoordsInstance = rc;
}

export function getRasterCoords(): RasterCoords {
    if (!rasterCoordsInstance) {
        throw new Error('RasterCoords 尚未初始化');
    }
    return rasterCoordsInstance;
}

export function mcCoordToLatLng(mcXZ: [number, number]): L.LatLng {
    const rc = getRasterCoords();
    const adjusted: [number, number] = [
        mcXZ[0] - mapConfig.leftTopX,
        mcXZ[1] - mapConfig.leftTopZ,
    ];
    return rc.unproject(adjusted);
}
