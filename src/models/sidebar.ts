export type StationRailwayInfo = {
  name: string;
  color: string;
};

export type StationCoordinate = {
  x?: number;
  y?: number;
  z?: number;
};

export type StationPanelData = {
  stationName: string;
  platformCount: number;
  coordinates?: StationCoordinate;
  railways: StationRailwayInfo[];
};
