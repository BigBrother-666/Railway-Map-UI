<script setup lang="ts">
import Sidebar from './SideBar.vue';
import {onMounted, onBeforeUnmount, ref} from 'vue';
import L, {type LatLng, type LatLngBounds, type Map as LeafletMap, type Point} from 'leaflet';
import 'leaflet-rastercoords';
import {COMMON_LINE_OPTIONS, COMMON_LINES_PANE, CONTACT_LINE_OPTIONS, CONTACT_LINES_PANE, mapConfig, ROUTE_PANE, STATION_MARKER_OPTIONS, STATIONS_PANE, TILE_URL} from "../constants/config.ts";
import {Graph, type Node} from "../models/graph.ts";
import type {StationPanelData, StationCoordinate, StationRailwayInfo} from "../models/sidebar.ts";
import {setRasterCoords, mcCoordToLatLng} from "../utils/coords.ts";

type RasterCoords = {
    project(latlng: LatLng): Point;
    unproject(coords: [number, number]): LatLng;
    getMaxBounds(): LatLngBounds;
    zoomLevel(): number;
};

const graph = new Graph();

const sidebarVisible = ref(false);
const sidebarData = ref<StationPanelData | null>(null);
let allStations = ref<string[]>([]);
const routingMode = ref<'start' | 'end' | null>(null);
let sidebarRef = ref<InstanceType<typeof Sidebar> | null>(null);
const sidebarPixelWidth = ref(0);

function deriveRailwayColor(node: Node): string {
    return graph.railwayColorMap.get(node.railwayName)
        ?? node.lineInFeature?.properties.line_color
        ?? node.lineOutFeature?.properties.line_color
        ?? node.mainLineFirstFeature?.properties.line_color
        ?? '#888888';
}

function buildRailwayList(nodes: Node[]): StationRailwayInfo[] {
    const railways = new Map<string, string>();
    nodes.forEach(node => {
        const name = node.railwayName?.trim();
        if (!name || railways.has(name)) return;
        railways.set(name, deriveRailwayColor(node));
    });
    return Array.from(railways.entries())
        .map(([name, color]) => ({name, color}))
        .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans', {sensitivity: 'base'}));
}

function deriveStationCoordinate(nodes: Node[], rawProps: Record<string, any>): StationCoordinate | undefined {
    if (nodes.length) {
        let sumX = 0;
        let sumZ = 0;
        nodes.forEach(node => {
            sumX += node.coordinates[0];
            sumZ += node.coordinates[1];
        });
        return {
            x: sumX / nodes.length,
            z: sumZ / nodes.length,
        };
    }
    const fallback = rawProps?.coordinates;
    if (Array.isArray(fallback) && fallback.length >= 2) {
        return {
            x: Number(fallback[0]),
            z: Number(fallback[1]),
        };
    }
    return undefined;
}

function buildStationPanelData(rawProps: Record<string, any>): StationPanelData | null {
    const stationName = rawProps?.stationName ?? rawProps?.station_name;
    if (!stationName) {
        return null;
    }
    const nodes = graph.stationNameMap.get(stationName) ?? [];
    const platformCount = nodes.length || rawProps?.platformCount || rawProps?.platform_count || 0;
    return {
        stationName,
        platformCount,
        coordinates: deriveStationCoordinate(nodes, rawProps),
        railways: buildRailwayList(nodes),
    };
}

function handleSidebarWidthChange(px: number) {
    sidebarPixelWidth.value = px;
    // 如果当前有高亮路线，重新按新的侧边栏宽度进行视图补偿
    try {
        if (mapInstance && currentShownPath && typeof currentShownPath.getRouteBounds === 'function') {
            const latlngs = currentShownPath.getRouteBounds();
            if (latlngs && latlngs.length > 0) {
                const bounds = L.latLngBounds(latlngs);
                const paddingTopLeft = L.point(20, 20);
                const paddingBottomRight = L.point(20 + (sidebarPixelWidth.value || 0), 20);
                (mapInstance as any).flyToBounds(bounds, {
                    paddingTopLeft,
                    paddingBottomRight,
                    duration: 0.8,
                } as any);
            }
        }
    } catch (e) {
        // ignore
    }
}

function recomputeSidebarWidth() {
    const isMobile = window.innerWidth <= 768;
    sidebarPixelWidth.value = sidebarVisible.value ? (isMobile ? Math.round(window.innerWidth * 0.85) : 360) : 0;
}

function openSidebar(data: Record<string, any>) {
    sidebarData.value = buildStationPanelData(data);
    sidebarVisible.value = true;
    recomputeSidebarWidth();
}

function closeSidebar() {
    sidebarVisible.value = false;
    routingMode.value = null;
    sidebarPixelWidth.value = 0;
}

let mapInstance: LeafletMap | null = null;
let rasterCoords: RasterCoords | null = null;
let baseTileLayer: L.TileLayer | null = null;
let stationLayer: L.GeoJSON | null = null;
// 用于保存 feature id -> layer 的映射，便于之后单个要素样式/交互更新
const featureLayerMap: Map<string, L.Layer> = new Map();
// 当前在地图上高亮显示的 PathInfo（若有）
let currentShownPath: any = null;

let lastZoomState: boolean | null = null;

function handleZoomChange() {
    if (!mapInstance || !stationLayer) return;
    const zoom = mapInstance.getZoom();
    // 缩放级别在 1-7 时显示站点，其他级别隐藏
    const shouldShow = zoom >= 1 && zoom <= 9;

    // 只在状态改变时才 add/remove，避免频繁操作
    if (lastZoomState !== shouldShow) {
        if (shouldShow) {
            stationLayer.addTo(mapInstance);
        } else {
            stationLayer.remove();
        }
        lastZoomState = shouldShow;
    }
}


function initMap(containerId: string) {
    const img: [number, number] = [
        mapConfig.imageWidth / mapConfig.rate,
        mapConfig.imageHeight / mapConfig.rate,
    ];

    const map = L.map(containerId, {
        crs: L.CRS.Simple,
        zoomSnap: 0.5,
        zoomDelta: 0.5,
        wheelPxPerZoomLevel: 80
    });
    const rc = new (L as any).RasterCoords(map, img) as RasterCoords;

    map.setMaxZoom(mapConfig.maxZoom);
    map.setMinZoom(mapConfig.minZoom);
    map.setView(rc.unproject(mapConfig.initViewLngLat.slice() as [number, number]), mapConfig.initViewZoom);
    map.setMaxBounds(undefined);

    mapInstance = map;
    rasterCoords = rc;
    setRasterCoords(rc);
}

function loadTiles() {
    if (!mapInstance || !rasterCoords) return;

    baseTileLayer = L.tileLayer(TILE_URL, {
        noWrap: true,
        minZoom: mapConfig.minZoom,
        maxZoom: mapConfig.maxZoom,
        minNativeZoom: mapConfig.minNativeZoom,
        bounds: rasterCoords.getMaxBounds(),
        maxNativeZoom: rasterCoords.zoomLevel(),
        opacity: 0.2,
        attribution: `© 2026 Paralon Railway Company | BigBrother  `
    }).addTo(mapInstance);
    mapInstance.attributionControl.setPrefix(false);
}


function initLayerPanes() {
    if (!mapInstance || !rasterCoords) return;

    mapInstance.createPane(COMMON_LINES_PANE);
    mapInstance.getPane(COMMON_LINES_PANE)!.style.zIndex = '300';

    mapInstance.createPane(CONTACT_LINES_PANE);
    mapInstance.getPane(CONTACT_LINES_PANE)!.style.zIndex = '200';

    mapInstance.createPane(STATIONS_PANE);
    mapInstance.getPane(STATIONS_PANE)!.style.zIndex = '600';

    mapInstance.createPane(ROUTE_PANE);
    mapInstance.getPane(ROUTE_PANE)!.style.zIndex = '800';
}

function addGeoJsonToLayers() {
    if (!mapInstance || !rasterCoords) return;

    const commonLineFeatures: any[] = [];
    const contactLineFeatures: any[] = [];
    const stationFeatures: any[] = [];

    // 聚合 features
    for (const [node, edges] of graph.adjacencyList) {
        if (node.lineInFeature) commonLineFeatures.push(node.lineInFeature);
        if (node.lineOutFeature) commonLineFeatures.push(node.lineOutFeature);
        if (node.mainLineFirstFeature) commonLineFeatures.push(node.mainLineFirstFeature);

        for (const edge of edges) {
            if (edge.isContact()) contactLineFeatures.push(edge.lineFeature);
            else commonLineFeatures.push(edge.lineFeature);
        }
    }
    // 合并station的站台
    for (const [stationName, nodes] of graph.stationNameMap) {
        if (nodes.length === 0) continue;

        // 求平均坐标
        let sumLng = 0;
        let sumLat = 0;
        nodes.forEach(node => {
            sumLng += node.coordinates[0];
            sumLat += node.coordinates[1];
        });
        const avgLng = sumLng / nodes.length;
        const avgLat = sumLat / nodes.length;

        const stationPoint = {
            type: "Feature",
            properties: {
                stationName,
                platformCount: nodes.length,
                coordinates: [avgLng, avgLat]
            },
            geometry: {
                type: "Point",
                coordinates: [avgLng, avgLat]
            }
        };
        stationFeatures.push(stationPoint);
    }

    const commonCollection = {type: 'FeatureCollection', features: commonLineFeatures} as GeoJSON.FeatureCollection;
    const contactCollection = {type: 'FeatureCollection', features: contactLineFeatures} as GeoJSON.FeatureCollection;
    const stationCollection = {type: 'FeatureCollection', features: stationFeatures} as GeoJSON.FeatureCollection;

    L.geoJSON(commonCollection as GeoJSON.FeatureCollection, ({
        pane: COMMON_LINES_PANE,
        coordsToLatLng: mcCoordToLatLng,
        style: (feature: any) => ({
            ...COMMON_LINE_OPTIONS,
            color: feature?.properties?.line_color ?? '#888',
        }),
        onEachFeature: (feature: any, layer: L.Layer) => {
            const props = feature?.properties ?? {};
            const rows = Object.entries(props)
                .map(([key, val]) => `<b>${key}</b>: ${val}`)
                .join('<br>');
            layer.bindPopup(rows || '无属性');
            // 尝试用 properties.id 或 Leaflet stamp 作为 key
            const id = (feature && feature.properties && feature.properties.id) ? String(feature.properties.id) : String(L.stamp(layer));
            featureLayerMap.set(id, layer);
        }
    } as any)).addTo(mapInstance);

    L.geoJSON(contactCollection as GeoJSON.FeatureCollection, ({
        pane: CONTACT_LINES_PANE,
        coordsToLatLng: mcCoordToLatLng,
        style: (feature: any) => ({
            ...CONTACT_LINE_OPTIONS,
            color: feature?.properties?.line_color ?? '#444',
        }),
        onEachFeature: (feature: any, layer: L.Layer) => {
            const props = feature?.properties ?? {};
            const rows = Object.entries(props)
                .map(([key, val]) => `<b>${key}</b>: ${val}`)
                .join('<br>');
            layer.bindPopup(rows || '无属性');
            const id = (feature && feature.properties && feature.properties.id) ? String(feature.properties.id) : String(L.stamp(layer));
            featureLayerMap.set(id, layer);
        }
    } as any)).addTo(mapInstance);

    stationLayer = L.geoJSON(stationCollection as GeoJSON.FeatureCollection, ({
        pane: STATIONS_PANE,
        coordsToLatLng: mcCoordToLatLng,
        pointToLayer: (feature: any, latlng: L.LatLng) => {
            const props = feature?.properties ?? {};
            // 创建一个 group，包含圆点和下方文字
            const marker = L.circleMarker(latlng, {...STATION_MARKER_OPTIONS, pane: STATIONS_PANE});
            const labelIcon = L.divIcon({
                html: `<div class='station-label'>${props.stationName ?? ''}</div>`,
                className: '',
                iconSize: [60, 24],
                iconAnchor: [30, -2], // 让文字在点下方居中
                pane: STATIONS_PANE,
            });
            // 让文字也可交互
            const labelMarker = L.marker(latlng, {icon: labelIcon, interactive: true, pane: STATIONS_PANE});
            return L.layerGroup([marker, labelMarker]);
        },
        onEachFeature: (feature: any, layer: L.Layer) => {
            const props = feature?.properties ?? {};
            const id = (feature && feature.properties && feature.properties.id) ? String(feature.properties.id) : String(L.stamp(layer));
            featureLayerMap.set(id, layer);
            // LayerGroup，需给圆点和文字都绑定点击事件
            const layers = (layer as any).getLayers?.() ?? [];
            const marker = layers[0];
            const labelMarker = layers[1];
            const clickHandler = () => {
                const stationName = props.stationName;
                if (sidebarRef.value?.isRoutePlanning) {
                    sidebarRef.value?.fillStationFromMap(stationName);
                }
                openSidebar(props);
                sidebarRef.value?.expandSidebar();

            };
            if (marker && marker.on) marker.on('click', clickHandler);
            if (labelMarker && labelMarker.on) labelMarker.on('click', clickHandler);
        }
    } as any)) as any;

    if (stationLayer && mapInstance) {
        stationLayer.addTo(mapInstance);
    }

    try {
        graph.applyLayerMap(featureLayerMap);
    } catch (e) {
        // ignore
    }
}

async function loadGeojson() {
    await graph.buildGraph();
    addGeoJsonToLayers();
}

function handleSetRoutingMode(mode: 'start' | 'end' | null) {
    routingMode.value = mode;
}

function handleRouteSubmit(route: { start: string; end: string }) {
    const paths = graph.findPath(route.start, route.end);
    sidebarRef.value?.setRoutes(paths);
}

function handleShowRoute(pathInfo: any) {
    if (!mapInstance) return;

    // 如果已经有路径在显示，先恢复它
    if (currentShownPath) {
        try {
            if (typeof currentShownPath.restoreRoute === 'function') {
                currentShownPath.restoreRoute(mapInstance);
            }
        } catch (e) {
            // ignore
        }
        currentShownPath = null;
    }

    // 如果传入 null，表示清除显示（例如侧边栏返回/取消）
    if (!pathInfo) {
        return;
    }

    // 显示新路径并保存引用
    try {
        if (typeof pathInfo.showRouteOnMap === 'function') {
            pathInfo.showRouteOnMap(mapInstance);
            currentShownPath = pathInfo;

            // 在显示路线后，根据侧边栏状态调整视图边界
            try {
                if (typeof pathInfo.getRouteBounds === 'function') {
                    const latlngs = pathInfo.getRouteBounds();
                    if (latlngs && latlngs.length > 0) {
                        const bounds = L.latLngBounds(latlngs);
                        // 使用来自侧边栏的实际像素宽度（右侧补偿更大，避免遮挡）
                        const sidebarWidth = sidebarPixelWidth.value || 0;
                        const paddingTopLeft = L.point(20, 20);
                        const paddingBottomRight = L.point(30 + sidebarWidth, 20);

                        // 使用 flyToBounds 并设置更慢的动画速度
                        (mapInstance as any).flyToBounds(bounds, {
                            paddingTopLeft,
                            paddingBottomRight,
                            duration: 0.6,
                        } as any);
                    }
                }
            } catch (e) {
                // ignore 错误
            }
        }
    } catch (e) {
        // ignore
    }
}

onMounted(async () => {
    initMap('map');
    if (!mapInstance) return;

    initLayerPanes();
    loadTiles();
    await loadGeojson();

    // 添加缩放事件监听，控制站点显示
    mapInstance.on('zoom', handleZoomChange);
    // 初始化时检查一次缩放级别
    handleZoomChange();

    allStations.value = Array.from(graph.stationNameMap.keys())
    allStations.value.sort()
    console.log('GeoJSON loaded, total stations:', allStations.value.length);
});

onBeforeUnmount(() => {
    if (mapInstance) {
        mapInstance.off('zoom', handleZoomChange);
    }
    baseTileLayer?.remove();
    mapInstance?.remove();
    mapInstance = null;
    rasterCoords = null;
    stationLayer = null;
});
</script>

<template>
    <div id="map" style="width: 100%; height: 100vh; background-color: #242424"></div>

    <!-- 路线规划侧边栏 -->
    <Sidebar
        ref="sidebarRef"
        :visible="sidebarVisible"
        :data="sidebarData"
        :all-stations="allStations"
        @close="closeSidebar"
        @set-routing-mode="handleSetRoutingMode"
        @route-submit="handleRouteSubmit"
        @show-route="handleShowRoute"
        @sidebar-width-change="handleSidebarWidthChange"
    />
</template>

<style scoped>
.station-label {
    color: #fff;
    font-size: 15px;
    font-weight: 500;
    line-height: 1.1;
    margin-top: 14px;
    text-align: center;
    text-shadow: -1px -1px 0 #000,
    1px -1px 0 #000,
    -1px 1px 0 #000,
    1px 1px 0 #000,
    0px 2px 4px #222;
    background: none;
    border: none;
    padding: 0;
    pointer-events: none;
}
</style>