// 基础geojson
// export interface GeoJSONFeatureCollection {
//     type: "FeatureCollection";
//     features: GeoJSONFeature[];
// }
//
// export interface GeoJSONFeature {
//     type: "Feature";
//     properties: any;
//     geometry: GeoJSONGeometry;
// }
//
// export type GeoJSONGeometry =
//     | PointGeometry
//     | LineStringGeometry;

export interface PointGeometry {
    type: "Point";
    coordinates: [number, number, number];
}

export interface LineStringGeometry {
    type: "LineString";
    coordinates: [number, number, number][];
}

// station点
export interface StationProperties {
    station_name: string;
    child_platform_tags: string[];
    platform_tag: string;
    railway_direction: string;
    tag: string;
    railway_name: string;
}

// 根据line_type区分
export interface BaseLineProperties {
    distance: number;
    line_type: "line_in" | "line_out" | "main_line_first" | "main_line_second";
    line_color: string;
}

export interface SingleLineProperties extends BaseLineProperties {
    line_type: "line_in" | "line_out" | "main_line_first";
}

export interface MainLineSecondProperties extends BaseLineProperties {
    line_type: "main_line_second";
    end_platform_tag: string;
    end_station_name: string;
    end_railway_direction: string;
    end_railway_name: string;
    end_tag: string;
}

export type StationFeature = {
    type: "Feature";
    properties: StationProperties;
    geometry: PointGeometry;
};

export type SingleLineFeature = {
    type: "Feature";
    properties: SingleLineProperties;
    geometry: LineStringGeometry;
};

export type MainLineSecondFeature = {
    type: "Feature";
    properties: MainLineSecondProperties;
    geometry: LineStringGeometry;
};

// 最后的模型
export interface RailwayGeoJSON {
    type: "FeatureCollection";
    features: (
        | StationFeature
        | SingleLineFeature
        | MainLineSecondFeature
        )[];
}

// station point
export function isStationFeature(
    f: StationFeature | SingleLineFeature | MainLineSecondFeature
): f is StationFeature {
    return "station_name" in f.properties;
}

// line_in line_out main_line_first
export function isSingleLineFeature(
    f: StationFeature | SingleLineFeature | MainLineSecondFeature
): f is SingleLineFeature {
    return "line_type" in f.properties && f.properties.line_type !== "main_line_second";
}

// main_line_second
export function isMainLineSecondFeature(
    f: StationFeature | SingleLineFeature | MainLineSecondFeature
): f is MainLineSecondFeature {
    return "line_type" in f.properties && f.properties.line_type === "main_line_second";
}

