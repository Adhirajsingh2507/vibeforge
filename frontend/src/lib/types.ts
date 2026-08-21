export interface Tile {
  x: number;
  y: number;
  z: number;
  class: string;
  slope: number;
  safety_score: number;
  zone: number;
}

export interface PathPoint {
  t: number;
  x: number;
  y: number;
  heading: number;
  mode: string;
}

export interface Site {
  id: string;
  x: number;
  y: number;
  safety_score: number;
  rank: number;
}

export interface Boundary {
  type: string;
  polyline: number[][];
}
