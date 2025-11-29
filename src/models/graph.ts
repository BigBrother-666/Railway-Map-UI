// ========================
// Node（节点）
// ========================
import { isMainLineSecondFeature, isSingleLineFeature, isStationFeature, type MainLineSecondFeature, type RailwayGeoJSON, type SingleLineFeature, type StationFeature } from "./geojsonModel.ts";
import { GEOJSON_FILES, MAP_PANES, ROUTE_PANE, STATION_MARKER_OPTIONS } from "../constants/config.ts";
import L from "leaflet";
import { mcCoordToLatLng } from "../utils/coords.ts";

let __featureIdCounter = 1;

function ensureFeatureId(feat: any, prefix?: string) {
    if (!feat || !feat.properties) return;
    if (!feat.properties.id) {
        const base = prefix ? `${prefix}` : 'f';
        feat.properties.id = `${base}_${Date.now()}_${(__featureIdCounter++).toString(36)}`;
    }
}

export class Node {
    stationFeature: StationFeature;

    stationName: string;
    platformTag: string;
    railwayDirection: string;
    tag: string;
    railwayName: string;
    coordinates: [number, number, number];
    childPlatformTags: string[];

    lineInFeature?: SingleLineFeature;
    lineOutFeature?: SingleLineFeature;
    mainLineFirstFeature?: SingleLineFeature;

    // Leaflet 图层
    lineInLayer?: L.GeoJSON;
    lineOutLayer?: L.GeoJSON;
    mainLineFirstLayer?: L.GeoJSON;
    stationLayer?: L.GeoJSON;

    constructor(geojson: RailwayGeoJSON) {
        const stationFeature = geojson.features.find(
            f => f.geometry.type === "Point"
        ) as StationFeature | undefined;

        if (!stationFeature) {
            throw new Error(`Geojson ${geojson} load error`);
        }

        this.stationFeature = stationFeature;

        this.stationName = stationFeature.properties.station_name;
        this.platformTag = stationFeature.properties.platform_tag;
        this.railwayDirection = stationFeature.properties.railway_direction;
        this.tag = stationFeature.properties.tag;
        this.railwayName = stationFeature.properties.railway_name;
        this.coordinates = stationFeature.geometry.coordinates;
        this.childPlatformTags = stationFeature.properties.child_platform_tags;

        // 绑定线段
        for (const f of geojson.features) {
            if (!isSingleLineFeature(f)) {
                continue;
            }
            if (f.properties.line_type === "line_in") {
                this.lineInFeature = f;
            }
            if (f.properties.line_type === "line_out") {
                this.lineOutFeature = f;
            }
            if (f.properties.line_type === "main_line_first") {
                this.mainLineFirstFeature = f;
            }
        }

        // 确保每个 feature 都有唯一 id，方便在 MapView 中通过 id 建立映射
        ensureFeatureId(this.stationFeature, `station_${this.platformTag}`);
        if (this.lineInFeature) ensureFeatureId(this.lineInFeature, `line_in_${this.platformTag}`);
        if (this.lineOutFeature) ensureFeatureId(this.lineOutFeature, `line_out_${this.platformTag}`);
        if (this.mainLineFirstFeature) ensureFeatureId(this.mainLineFirstFeature, `main_line_first_${this.platformTag}`);
    }

    isStation(): boolean {
        return this.stationName != null && this.stationName !== "";
    }

    setLineInStyle(style: L.PathOptions) {
        if (this.lineInLayer && (this.lineInLayer as any).setStyle) {
            (this.lineInLayer as any).setStyle(style);
        }
    }

    setLineOutStyle(style: L.PathOptions) {
        if (this.lineOutLayer && (this.lineOutLayer as any).setStyle) {
            (this.lineOutLayer as any).setStyle(style);
        }
    }

    setMainLineFirstStyle(style: L.PathOptions) {
        if (this.mainLineFirstLayer && (this.mainLineFirstLayer as any).setStyle) {
            (this.mainLineFirstLayer as any).setStyle(style);
        }
    }
}

// ========================
// Edge（边）
// ========================
export class Edge {
    target: Node;
    lineFeature: MainLineSecondFeature;
    leafletLayer?: L.GeoJSON; // 保存 Leaflet 图层对象

    constructor(target: Node, lineFeature: MainLineSecondFeature) {
        this.target = target;
        this.lineFeature = lineFeature;
        // 确保边对应的 feature 有 id
        ensureFeatureId(this.lineFeature, `main_line_second_${target.platformTag}`);
    }

    isContact(): boolean {
        return this.lineFeature?.properties.line_color === "#a9a9a9";
    }

    /** 设置颜色或样式 */
    setStyle(style: L.PathOptions) {
        if (this.leafletLayer && (this.leafletLayer as any).setStyle) {
            (this.leafletLayer as any).setStyle(style);
        }
    }
}

export class PathInfo {
    nodes: Node[];
    edges: Edge[];
    stationNames: string[]
    startNode?: Node;
    endNode?: Node;
    distance: number;
    leafletLayers: L.Layer[];

    constructor(nodes: Node[], edges: Edge[]) {
        this.nodes = nodes;
        this.edges = edges;
        this.distance = edges.reduce((acc, edge) => acc + edge.lineFeature.properties.distance, 0);
        let startNode = nodes.at(0);
        let endNode = nodes.at(-1);
        this.startNode = startNode;
        this.endNode = endNode;
        this.leafletLayers = [];
        if (startNode != null && startNode.lineOutFeature != null) {
            this.distance += startNode?.lineOutFeature?.properties.distance
        }
        if (endNode != null && endNode.lineInFeature != null) {
            this.distance += endNode?.lineInFeature?.properties.distance
        }
        this.stationNames = nodes
            .filter(node => node.isStation())
            .map(node => node.stationName);
    }

    /**
     * 计算路线的地理边界（返回所有坐标点的 LatLng 数组）
     * 供 MapView 中的 flyToBounds 使用
     */
    getRouteBounds(): L.LatLng[] {
        const latlngs: L.LatLng[] = [];

        const pushCoords = (coords: any) => {
            if (!coords) return;
            // Point: [x, z, ...]
            if (typeof coords[0] === 'number') {
                latlngs.push(mcCoordToLatLng([coords[0], coords[1]]));
                return;
            }
            // LineString: [[x,z,...], ...]
            if (Array.isArray(coords) && coords.length > 0 && typeof coords[0][0] === 'number') {
                for (const p of coords as any[]) {
                    latlngs.push(mcCoordToLatLng([p[0], p[1]]));
                }
                return;
            }
            // MultiLineString: [[[x,z,...], ...], ...]
            if (Array.isArray(coords)) {
                for (const part of coords as any[]) {
                    for (const p of part as any[]) {
                        latlngs.push(mcCoordToLatLng([p[0], p[1]]));
                    }
                }
            }
        };

        // 中间线路
        this.edges.forEach(edge => {
            try { pushCoords(edge.lineFeature.geometry.coordinates); } catch (e) { }
        });

        // 中间节点
        for (const node of this.nodes.slice(1, -1)) {
            if (node.mainLineFirstFeature != null) {
                try { pushCoords(node.mainLineFirstFeature.geometry.coordinates); } catch (e) { }
            }
            if (node.isStation() && node.stationFeature != null) {
                try { pushCoords(node.stationFeature.geometry.coordinates); } catch (e) { }
            }
        }

        // 起点
        if (this.startNode != null) {
            if (this.startNode.lineOutFeature != null) {
                try { pushCoords(this.startNode.lineOutFeature.geometry.coordinates); } catch (e) { }
            }
            if (this.startNode.isStation() && this.startNode.stationFeature != null) {
                try { pushCoords(this.startNode.stationFeature.geometry.coordinates); } catch (e) { }
            }
        }

        // 终点
        if (this.endNode != null) {
            if (this.endNode.lineInFeature != null) {
                try { pushCoords(this.endNode.lineInFeature.geometry.coordinates); } catch (e) { }
            }
            if (this.endNode.isStation() && this.endNode.stationFeature != null) {
                try { pushCoords(this.endNode.stationFeature.geometry.coordinates); } catch (e) { }
            }
        }

        return latlngs;
    }

    showRouteOnMap(map: L.Map) {
        for (const paneName of MAP_PANES) {
            map.getPane(paneName)!.style.opacity = "0.1";
        }

        // 中间线路feature
        this.edges.forEach(edge => {
            const g = L.geoJSON(edge.lineFeature, {
                pane: ROUTE_PANE,
                coordsToLatLng: mcCoordToLatLng,
                style: (feature: any) => ({
                    weight: 4.5,
                    lineJoin: 'round',
                    color: feature?.properties?.line_color ?? '#ff9823',
                })
            }).addTo(map);
            this.leafletLayers.push(g as any);
        })

        // 中间节点feature
        for (const node of this.nodes.slice(1, -1)) {
            if (node.mainLineFirstFeature != null) {
                const g = L.geoJSON(node.mainLineFirstFeature, {
                    pane: ROUTE_PANE,
                    coordsToLatLng: mcCoordToLatLng,
                    style: (feature: any) => ({
                        weight: 4.5,
                        lineJoin: 'round',
                        color: feature?.properties?.line_color ?? '#ff9823',
                    })
                }).addTo(map);
                this.leafletLayers.push(g as any);
            }
            if (node.isStation() && node.stationFeature != null) {
                const g = L.geoJSON(node.stationFeature, {
                    pane: ROUTE_PANE,
                    coordsToLatLng: mcCoordToLatLng,
                    pointToLayer: (_feature: any, latlng: L.LatLng) => L.circleMarker(latlng, {
                        ...STATION_MARKER_OPTIONS, pane: ROUTE_PANE,
                        opacity: 0.5,
                        fillOpacity: 0.5
                    }),
                }).addTo(map);
                this.leafletLayers.push(g as any);
            }
        }

        // 起点站feature
        if (this.startNode != null) {
            if (this.startNode.lineOutFeature != null) {
                const g = L.geoJSON(this.startNode.lineOutFeature, {
                    pane: ROUTE_PANE,
                    coordsToLatLng: mcCoordToLatLng,
                    style: (feature: any) => ({
                        weight: 4.5,
                        lineJoin: 'round',
                        color: feature?.properties?.line_color ?? '#ff9823',
                    })
                }).addTo(map);
                this.leafletLayers.push(g as any);
            }
            if (this.startNode.isStation() && this.startNode.stationFeature != null) {
                const g = L.geoJSON(this.startNode.stationFeature, {
                    pane: ROUTE_PANE,
                    coordsToLatLng: mcCoordToLatLng,
                    pointToLayer: (_: any, latlng: L.LatLng) => {
                        // 创建一个 group，包含圆点和下方文字
                        const marker = L.circleMarker(latlng, { ...STATION_MARKER_OPTIONS, pane: ROUTE_PANE, fillColor: '#4ade80' });
                        const labelIcon = L.divIcon({
                            html: `<div class='station-label'>${this.startNode!.stationName ?? ''}</div>`,
                            className: '',
                            iconSize: [60, 24],
                            iconAnchor: [30, -2], // 让文字在点下方居中
                            pane: ROUTE_PANE,
                        });
                        const labelMarker = L.marker(latlng, { icon: labelIcon, interactive: false, pane: ROUTE_PANE });
                        // 用 LayerGroup 组合
                        return L.layerGroup([marker, labelMarker]);
                    },
                }).addTo(map);
                this.leafletLayers.push(g as any);
            }
        }

        // 终点站feature
        if (this.endNode != null) {
            if (this.endNode.lineInFeature != null) {
                const g = L.geoJSON(this.endNode.lineInFeature, {
                    pane: ROUTE_PANE,
                    coordsToLatLng: mcCoordToLatLng,
                    style: (feature: any) => ({
                        weight: 4.5,
                        lineJoin: 'round',
                        color: feature?.properties?.line_color ?? '#ff9823',
                    })
                }).addTo(map);
                this.leafletLayers.push(g as any);
            }
            if (this.endNode.isStation() && this.endNode.stationFeature != null) {
                const g = L.geoJSON(this.endNode.stationFeature, {
                    pane: ROUTE_PANE,
                    coordsToLatLng: mcCoordToLatLng,
                    pointToLayer: (_: any, latlng: L.LatLng) => {
                        // 创建一个 group，包含圆点和下方文字
                        const marker = L.circleMarker(latlng, { ...STATION_MARKER_OPTIONS, pane: ROUTE_PANE, fillColor: '#ef4444' });
                        const labelIcon = L.divIcon({
                            html: `<div class='station-label'>${this.endNode!.stationName ?? ''}</div>`,
                            className: '',
                            iconSize: [60, 24],
                            iconAnchor: [30, -2], // 让文字在点下方居中
                            pane: ROUTE_PANE,
                        });
                        const labelMarker = L.marker(latlng, { icon: labelIcon, interactive: false, pane: ROUTE_PANE });
                        // 用 LayerGroup 组合
                        return L.layerGroup([marker, labelMarker]);
                    }
                }).addTo(map);
                this.leafletLayers.push(g as any);
            }
        }
    }

    restoreRoute(map: L.Map) {
        for (const paneName of MAP_PANES) {
            map.getPane(paneName)!.style.opacity = "1";
        }
        if (this.leafletLayers != null) {
            this.leafletLayers.forEach(layer => {
                try {
                    if (layer && (layer as any).remove) {
                        (layer as any).remove();
                    }
                } catch (e) {
                    // ignore
                }
            });
            this.leafletLayers = [];
        }
    }
}

// ========================
// Graph（图结构）
// Map<Node, Edge[]>
// ========================
export class Graph {
    adjacencyList: Map<Node, Edge[]> = new Map();
    platformTagMap: Map<string, Node> = new Map();   // pTag - Node
    stationNameMap: Map<string, Node[]> = new Map();  // stationName - [Node]
    railwayColorMap: Map<string, string> = new Map(); // railwayName - color

    /** 插入节点（如果不存在） */
    addNode(node: Node): void {
        if (!this.adjacencyList.has(node)) {
            this.adjacencyList.set(node, []);
        }
    }

    /** 添加有向边 */
    addEdge(from: Node, to: Node, lineFeature: MainLineSecondFeature): void {
        this.addNode(from);
        this.addNode(to);
        this.adjacencyList.get(from)!.push(new Edge(to, lineFeature));
    }

    /** 获取某节点的所有边 */
    getEdges(node: Node): Edge[] {
        return this.adjacencyList.get(node) ?? [];
    }

    /** 获取所有节点 */
    getNodes(): Node[] {
        return Array.from(this.adjacencyList.keys());
    }

    async loadAllGeoJSON() {
        const tasks = GEOJSON_FILES.map(async (file) => {
            const res = await fetch(`/geojson/${file}`);
            if (!res.ok) {
                throw new Error(`加载失败: ${file}`);
            }
            return res.json();
        });

        const results: RailwayGeoJSON[] = await Promise.all(tasks);

        const map = new Map<string, RailwayGeoJSON>();
        for (const geojson of results) {
            for (const f of geojson.features) {
                if (isStationFeature(f)) {
                    map.set(f.properties.platform_tag, geojson);
                    break;
                }
            }
        }

        return map;
    }

    async buildGraph() {
        let geoJSONMap;

        try {
            geoJSONMap = await this.loadAllGeoJSON();
        } catch (err) {
            console.error("部分 GeoJSON 文件加载失败：", err);
            return;
        }

        // 创建节点映射
        for (const [_, geojson] of geoJSONMap) {
            const node = new Node(geojson);
            if (node.isStation()) {
                if (!this.stationNameMap.has(node.stationName)) {
                    this.stationNameMap.set(node.stationName, [node])
                } else {
                    this.stationNameMap.get(node.stationName)!.push(node)
                }
            }
            this.platformTagMap.set(node.platformTag, node);
            if (!this.railwayColorMap.has(node.railwayName) && node.mainLineFirstFeature != null) {
                this.railwayColorMap.set(node.railwayName, node.mainLineFirstFeature.properties.line_color);
            }
        }

        // 构建图
        for (const [fromPtag, from] of this.platformTagMap) {
            for (const toPtag of from.childPlatformTags) {
                if (!toPtag) {
                    continue;
                }
                const to = this.platformTagMap.get(toPtag);
                const fromGeoJSON = geoJSONMap.get(fromPtag);
                if (to && fromGeoJSON) {
                    const lineFeature = fromGeoJSON.features.find(f => {
                        return isMainLineSecondFeature(f) && f.properties.end_platform_tag === toPtag;
                    }) as MainLineSecondFeature;
                    this.addEdge(from, to, lineFeature);
                }
            }
        }
    }

    findPath(startStationName: string, endStationName: string): PathInfo[] {
        const result: PathInfo[] = [];

        const startNodes = this.stationNameMap.get(startStationName) ?? [];
        const endNodes = this.stationNameMap.get(endStationName) ?? [];
        if (startNodes.length === 0 || endNodes.length === 0) return result;

        // DFS 函数
        const dfs = (
            currentNode: Node,
            startNode: Node,
            visitedStations: Set<string>,
            nodePath: Node[],  // 当前节点路径
            edgePath: Edge[]   // 当前边路径
        ) => {
            if (endNodes.includes(currentNode) && nodePath.length > 1) {
                // 到达终点
                result.push(new PathInfo([...nodePath], [...edgePath]));
                return;
            }

            // 2. 遍历所有出边
            for (const edge of this.getEdges(currentNode)) {
                const next = edge.target;

                // 不允许重复经过车站  起点终点相同除外
                if (visitedStations.has(next.stationName) && next.stationName !== endStationName) {
                    continue;
                }

                // 进入下一节点
                if (next.isStation()) {
                    visitedStations.add(next.stationName);
                }
                nodePath.push(next);
                edgePath.push(edge);

                dfs(next, startNode, visitedStations, nodePath, edgePath);

                // 回溯（undo）
                visitedStations.delete(next.stationName);
                nodePath.pop();
                edgePath.pop();
            }
        };

        // 从每一个开始站台起 DFS
        for (const sn of startNodes) {
            const visited = new Set<string>([sn.stationName]);
            dfs(sn, sn, visited, [sn], []);
        }

        return this.uniqueAndSortPaths(result);
    }

    uniqueAndSortPaths(paths: PathInfo[]): PathInfo[] {
        const map = new Map<string, PathInfo>();

        for (const p of paths) {
            // 顺序不同也算不同路径 → stationNames 直接 join
            const key = p.stationNames.join("->");

            if (!map.has(key)) {
                // 首次出现，加入
                map.set(key, p);
            } else {
                // 重复时保留 nodes 数更少的
                const old = map.get(key)!;
                if (p.nodes.length < old.nodes.length) {
                    map.set(key, p);
                }
            }
        }

        // 去重后的数组
        const result = [...map.values()];

        // 最后按 distance 升序排序
        result.sort((a, b) => a.distance - b.distance);

        return result;
    }

    /**
     * 将 MapView 中创建的 feature id -> Layer 映射，回写到 Node/Edge 的 layer 引用上。
     * 这样可使 Node.setLineOutStyle / Edge.setStyle 等方法生效。
     */
    applyLayerMap(layerMap: Map<string, L.Layer>) {
        // nodes
        for (const node of this.platformTagMap.values()) {
            try {
                const sf = node.stationFeature as any;
                if (sf && sf.properties && sf.properties.id) {
                    const l = layerMap.get(String(sf.properties.id));
                    if (l) node.stationLayer = l as any;
                }

                const lif = node.lineInFeature as any;
                const lof = node.lineOutFeature as any;
                const mff = node.mainLineFirstFeature as any;
                if (lif && lif.properties && lif.properties.id) {
                    const l = layerMap.get(String(lif.properties.id));
                    if (l) node.lineInLayer = l as any;
                }
                if (lof && lof.properties && lof.properties.id) {
                    const l = layerMap.get(String(lof.properties.id));
                    if (l) node.lineOutLayer = l as any;
                }
                if (mff && mff.properties && mff.properties.id) {
                    const l = layerMap.get(String(mff.properties.id));
                    if (l) node.mainLineFirstLayer = l as any;
                }
            } catch (e) {
                // ignore
            }
        }

        // edges
        for (const [, edges] of this.adjacencyList) {
            for (const edge of edges) {
                try {
                    const ef = edge.lineFeature as any;
                    if (ef && ef.properties && ef.properties.id) {
                        const l = layerMap.get(String(ef.properties.id));
                        if (l) edge.leafletLayer = l as any;
                    }
                } catch (e) {
                    // ignore
                }
            }
        }
    }
}
