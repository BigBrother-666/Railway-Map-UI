<template>
  <div>
    <div :class="['sidebar', { 'sidebar-open': visible && !collapsed, 'sidebar-collapsed': visible && collapsed }]">
      <button
        v-if="visible"
        class="sidebar-handle"
        :aria-label="collapsed ? '展开侧边栏' : '收起侧边栏'"
        @click="toggleCollapse"
      >
        {{ collapsed ? '⟨' : '⟩' }}
      </button>
      <div class="sidebar-header">
        <h2 v-if="mode === 'info'">{{ '车站信息' }}</h2>
        <h2 v-else-if="mode === 'route'">直达车路线查询</h2>
        <h2 v-else>查询结果 ({{(routes.length)}})</h2>
        <button class="close-btn" @click="handleClose">×</button>
      </div>

      <div class="sidebar-content">
        <!-- 车站信息模式 -->
        <template v-if="mode === 'info'">
          <div v-if="data" class="station-info-panel">
            <div class="station-card">
              <div class="station-card-header">
                <div class="station-title">{{ data.stationName }}</div>
                <span class="station-chip">站点</span>
              </div>
              <div class="station-stats">
                <div class="stat-item stat-item--platform">
                  <span class="stat-label">站台数量</span>
                  <span class="stat-value">{{ data.platformCount ?? '—' }}</span>
                </div>
                <span class="stat-divider"></span>
                <div class="stat-item stat-item--coords">
                  <span class="stat-label">车站坐标</span>
                  <div class="coord-lines">
                    <span class="coord-line">{{ formattedCoords.x }}</span>
                    <span class="coord-line">{{ formattedCoords.z }}</span>
                  </div>
                </div>
              </div>
            </div>

            <div class="railway-section">
              <div class="section-title">途经铁路</div>
              <div v-if="data.railways?.length" class="railway-list">
                <div
                    v-for="rail in data.railways"
                    :key="rail.name"
                    class="railway-row"
                    :style="{ '--railway-color': rail.color || '#888' }"
                >
                  <span class="railway-line"></span>
                  <span class="railway-name">{{ rail.name }}</span>
                </div>
              </div>
              <div v-else class="empty-hint">暂无数据</div>
            </div>
          </div>
          <div v-else class="empty-hint">
            尚未选择车站
          </div>
        </template>

        <!-- 路线规划模式 -->
        <template v-else-if="mode === 'route'">
          <div class="route-container">
            <!-- 起点输入框 -->
            <div class="input-group">
              <label class="input-label">
                <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"></circle>
                  <circle cx="12" cy="12" r="3"></circle>
                </svg>
                起点
              </label>
              <input
                  v-model="startInput"
                  type="text"
                  class="route-input"
                  placeholder="点击地图选择或输入站名"
                  @focus="activeInput = 'start'"
                  @input="onStartInput"
              />
              <div v-if="activeInput === 'start' && startSuggestions.length" class="suggestions">
                <div
                    v-for="station in startSuggestions"
                    :key="station"
                    class="suggestion-item"
                    @click="selectStart(station)"
                >
                  {{ station }}
                </div>
              </div>
              <div v-if="startInput && !startStationValid" class="error-hint">
                车站名不存在
              </div>
            </div>

            <!-- 交换按钮 -->
            <div class="swap-button-container">
              <div style="position:relative;display:flex;align-items:center;justify-content:center;">
                <button 
                  class="swap-btn" 
                  @mouseenter="swapBtnHover = true"
                  @mouseleave="swapBtnHover = false"
                  @focus="swapBtnHover = true"
                  @blur="swapBtnHover = false"
                  @click="swapStations"
                  :disabled="!startInput && !endInput"
                  aria-label="交换起点和终点"
                >
                  <svg class="swap-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M7 16V4M7 4L3 8M7 4L11 8"></path>
                    <path d="M17 8V20M17 20L21 16M17 20L13 16"></path>
                  </svg>
                </button>
                <div v-if="swapBtnHover" class="swap-tooltip">交换起点和终点</div>
              </div>
            </div>

            <!-- 终点输入框 -->
            <div class="input-group">
              <label class="input-label">
                <svg class="icon" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"></path>
                </svg>
                终点
              </label>
              <input
                  v-model="endInput"
                  type="text"
                  class="route-input"
                  placeholder="点击地图选择或输入站名"
                  @focus="activeInput = 'end'"
                  @input="onEndInput"
              />
              <div v-if="activeInput === 'end' && endSuggestions.length" class="suggestions">
                <div
                    v-for="station in endSuggestions"
                    :key="station"
                    class="suggestion-item"
                    @click="selectEnd(station)"
                >
                  {{ station }}
                </div>
              </div>
              <div v-if="endInput && !endStationValid" class="error-hint">
                车站名不存在
              </div>
            </div>
          </div>
        </template>

        <!-- 查询结果模式 -->
        <template v-else-if="mode === 'result'">
          <div v-if="routes.length > 0" class="routes-list">
            <div
                v-for="(route, index) in routes"
                :key="index"
                :class="['route-card', { 'route-card-active': selectedRouteIndex === index }]"
                @click="selectRoute(index)"
            >
              <div class="route-header">
                <span class="route-index">路线 {{ index + 1 }}</span>
                <div class="route-metrics">
                  <span class="route-distance">{{ (route.distance / 1000).toFixed(2) }} km</span>
                  <span class="route-price">{{ (route.distance / 1000 * 0.2).toFixed(2) }} 银币</span>
                </div>
              </div>
              <div class="route-stations">
                <div class="station-item start-station">
                  <span class="station-name">{{ startInput }}</span>
                </div>
                <div v-if="route.stationNames.length > 2" class="station-path">
                  <!-- 折叠状态：只显示前两个中间站 -->
                  <template v-if="!expandedRoutes.has(index) && route.stationNames.length - 2 > 2">
                    <div v-for="(stationName, idx) in route.stationNames.slice(1, 3)" :key="idx" class="middle-station">
                      {{ stationName }}
                    </div>
                    <div class="collapse-hint" @click.stop="toggleExpanded(index)">
                      <span>+{{ route.stationNames.length - 4 }}</span> 
                      <svg class="expand-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="6 9 12 15 18 9"></polyline>
                      </svg>
                    </div>
                  </template>
                  <!-- 展开状态：显示所有中间站 -->
                  <template v-else-if="expandedRoutes.has(index)">
                    <div v-for="(stationName, idx) in route.stationNames.slice(1, -1)" :key="idx" class="middle-station">
                      {{ stationName }}
                    </div>
                    <div class="collapse-hint" @click.stop="toggleExpanded(index)">
                      <span>折叠</span>
                      <svg class="expand-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="transform: rotate(180deg)">
                        <polyline points="6 9 12 15 18 9"></polyline>
                      </svg>
                    </div>
                  </template>
                  <!-- 中间站不多（≤2个）：直接显示全部 -->
                  <template v-else>
                    <div v-for="(stationName, idx) in route.stationNames.slice(1, -1)" :key="idx" class="middle-station">
                      {{ stationName }}
                    </div>
                  </template>
                </div>
                <div class="station-item end-station">
                  <span class="station-name">{{ endInput }}</span>
                </div>
              </div>
              <div class="route-info">
                <span class="info-item">
                  <svg class="mini-icon" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5z"></path>
                  </svg>
                  {{ route.stationNames.length }} 站
                </span>
              </div>
            </div>
          </div>
          <div v-else class="no-routes">
            <p>未找到匹配的路线</p>
          </div>
        </template>
      </div>

      <div class="sidebar-footer">
        <template v-if="mode === 'info'">
          <button
              class="route-btn"
              @click="assignInfoStation('start')"
              :disabled="!currentStationName"
          >
            设为起点
          </button>
          <button
              class="route-btn"
              @click="assignInfoStation('end')"
              :disabled="!currentStationName"
          >
            设为终点
          </button>
        </template>
        <template v-else-if="mode === 'route'">
          <button
              class="submit-btn"
              :disabled="!startInput || !endInput || !startStationValid || !endStationValid"
              @click="submitRoute"
          >
            查询路线
          </button>
          <button class="cancel-btn" @click="exitRouteMode">
            取消
          </button>
        </template>
        <template v-else-if="mode === 'result'">
          <button class="back-btn" @click="backToRoute">
            ← 返回
          </button>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import type { PathInfo } from '../models/graph.ts'
import type { StationPanelData } from '../models/sidebar.ts'

const props = defineProps<{
  visible: boolean,
  data: StationPanelData | null,
  allStations: string[]
}>();

const emit = defineEmits(['close', 'set-routing-mode', 'route-submit', 'show-route', 'sidebar-width-change']);

const mode = ref<'info' | 'route' | 'result'>('info');
const startInput = ref('');
const endInput = ref('');
const swapBtnHover = ref(false);
const activeInput = ref<'start' | 'end' | null>(null);
const routingMode = ref<'start' | 'end' | null>(null);
const routes = ref<PathInfo[]>([]);
const selectedRouteIndex = ref<number | null>(null);
const expandedRoutes = ref<Set<number>>(new Set()); // 追踪哪些路线卡片是展开的
const isRoutePlanning = ref(false); // 是否处于路线规划模式

type RouteModeOptions = {
  resetInputs?: boolean;
  start?: string;
  end?: string;
};

// 折叠控制
const collapsed = ref(false);
const PEEK_WIDTH = 16; // 折叠时保留的像素宽度

// 车站验证
const startStationValid = ref(true);
const endStationValid = ref(true);
const currentStationName = computed(() => props.data?.stationName ?? '');
const formattedCoords = computed(() => formatCoordinate(props.data?.coordinates));

function formatCoordinate(coord?: StationPanelData['coordinates']) {
  const fallback = { x: 'X=—', z: 'Z=—' };
  if (!coord || coord.x == null || (coord.z == null && coord.y == null)) return fallback;
  const zVal = coord.z ?? coord.y ?? 0;
  return {
    x: `X=${Math.round(coord.x)}`,
    z: `Z=${Math.round(zVal)}`
  };
}

function isStationValid(name: string): boolean {
  if (!name) return true; // 空值不显示错误
  return props.allStations.includes(name);
}

function getSidebarPixelWidth(): number {
  const isMobile = window.innerWidth <= 768;
  const full = isMobile ? Math.round(window.innerWidth * 0.85) : 360;
  return collapsed.value ? PEEK_WIDTH : full;
}

function notifySidebarWidth() {
  emit('sidebar-width-change', getSidebarPixelWidth());
}

function toggleCollapse() {
  collapsed.value = !collapsed.value;
  notifySidebarWidth();
}

const startSuggestions = computed(() => {
  if (!startInput.value) return [];
  return filterStations(startInput.value).slice(0, 5);
});

const endSuggestions = computed(() => {
  if (!endInput.value) return [];
  return filterStations(endInput.value).slice(0, 5);
});

function filterStations(query: string) {
  const q = query.toLowerCase();
  return props.allStations.filter((station: string) =>
      station.toLowerCase().includes(q)
  );
}

function handleClose() {
  mode.value = 'info';
  routingMode.value = null;
  startInput.value = '';
  endInput.value = '';
  activeInput.value = null;
  selectedRouteIndex.value = null;
  collapsed.value = false;
  isRoutePlanning.value = false;
  emit('set-routing-mode', null);
  emit('show-route', null);
  emit('close');
  emit('sidebar-width-change', 0);
}

function enterRouteMode(options?: RouteModeOptions) {
  mode.value = 'route';
  routingMode.value = null;
  activeInput.value = null;
  selectedRouteIndex.value = null;

  const shouldReset = options?.resetInputs ?? true;
  if (shouldReset) {
    startInput.value = options?.start ?? '';
    endInput.value = options?.end ?? currentStationName.value ?? '';
  } else {
    if (options?.start !== undefined) startInput.value = options.start;
    if (options?.end !== undefined) endInput.value = options.end;
  }

  startStationValid.value = isStationValid(startInput.value);
  endStationValid.value = isStationValid(endInput.value);
  isRoutePlanning.value = true;
  emit('set-routing-mode', 'route');
  emit('show-route', null);
}

function exitRouteMode() {
  mode.value = 'info';
  routingMode.value = null;
  startInput.value = '';
  endInput.value = '';
  activeInput.value = null;
  selectedRouteIndex.value = null;
  isRoutePlanning.value = false;
  emit('set-routing-mode', null);
  emit('show-route', null);
}

function assignInfoStation(target: 'start' | 'end') {
  const station = currentStationName.value;
  if (!station) return;
  const options: RouteModeOptions = { resetInputs: false };
  if (target === 'start') {
    options.start = station;
  } else {
    options.end = station;
  }
  enterRouteMode(options);
}

function selectStart(station: string) {
  startInput.value = station;
  activeInput.value = null;
  startStationValid.value = true;
}

function selectEnd(station: string) {
  endInput.value = station;
  activeInput.value = null;
  endStationValid.value = true;
}


function swapStations() {
  const temp = startInput.value;
  startInput.value = endInput.value;
  endInput.value = temp;
  
  // 交换验证状态
  const tempValid = startStationValid.value;
  startStationValid.value = endStationValid.value;
  endStationValid.value = tempValid;
}

function onStartInput() {
  startStationValid.value = isStationValid(startInput.value);
}

function onEndInput() {
  endStationValid.value = isStationValid(endInput.value);
}

function submitRoute() {
  if (!startInput.value || !endInput.value) return;
  emit('route-submit', {
    start: startInput.value,
    end: endInput.value
  });
}

function toggleExpanded(index: number) {
  if (expandedRoutes.value.has(index)) {
    expandedRoutes.value.delete(index);
  } else {
    expandedRoutes.value.add(index);
  }
}

function selectRoute(index: number) {
  selectedRouteIndex.value = index;
  emit('show-route', routes.value[index]);
}

function backToRoute() {
  mode.value = 'route';
  selectedRouteIndex.value = null;
  emit('show-route', null);
}

// 暴露方法给 MapView 调用
function setStartFromMap(station: string) {
  startInput.value = station;
  startStationValid.value = true;
}

function setEndFromMap(station: string) {
  endInput.value = station;
  endStationValid.value = true;
}

// 智能填充：优先填充空的输入框
function fillStationFromMap(station: string) {
  if (!startInput.value) {
    setStartFromMap(station);
  } else if (!endInput.value) {
    setEndFromMap(station);
  }
}

// 接收路线查询结果
function setRoutes(pathInfos: PathInfo[]) {
  routes.value = pathInfos;
  mode.value = 'result';
  activeInput.value = null;
  expandedRoutes.value.clear();
  // 自动选中第一条路线
  selectedRouteIndex.value = pathInfos.length > 0 ? 0 : null;
  if (pathInfos.length > 0) {
    emit('show-route', pathInfos[0]);
  }
}

// 展开侧边栏（如果当前是折叠状态）
function expandSidebar() {
  if (collapsed.value) {
    collapsed.value = false;
    notifySidebarWidth();
  }
}

defineExpose({
  setStartFromMap,
  setEndFromMap,
  fillStationFromMap,
  enterRouteMode,
  setRoutes,
  expandSidebar,
  isRoutePlanning: computed(() => isRoutePlanning.value)
})

// 可见性变化时汇报当前宽度
watch(() => props.visible, (v) => {
  if (v) {
    collapsed.value = false;
    notifySidebarWidth();
  } else {
    emit('sidebar-width-change', 0);
  }
});

onMounted(() => {
  if (props.visible) notifySidebarWidth();
});
</script>

<style scoped>
/* 侧边栏主体 */
.sidebar {
  position: fixed;
  top: 0;
  right: 0;
  width: 360px;
  height: 100vh;
  background: #1e1e1e;
  color: #fff;
  box-shadow: -4px 0 12px rgba(0, 0, 0, 0.5);
  transition: transform 0.3s ease;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  transform: translateX(100%);
  --peek-width: 16px;
}

.sidebar-open {
  transform: translateX(0);
}

.sidebar-collapsed {
  transform: translateX(calc(100% - var(--peek-width)));
}

/* 顶部标题栏 */
.sidebar-header {
  padding: 16px;
  background: #2c2c2c;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 18px;
  border-bottom: 1px solid #444;
  flex-shrink: 0;
}

.sidebar-header h2 {
  margin: 0;
  font-size: 18px;
}

.close-btn {
  background: none;
  border: none;
  color: #ccc;
  font-size: 24px;
  cursor: pointer;
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: all 0.2s;
}

.close-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

/* 外侧把手 */
.sidebar-handle {
  position: absolute;
  left: -28px;
  top: 50%;
  transform: translateY(-50%);
  width: 28px;
  height: 64px;
  border: none;
  border-radius: 8px 0 0 8px;
  background: linear-gradient(180deg, #3a7afe, #6a9eff);
  color: #fff;
  cursor: pointer;
  box-shadow: -2px 0 8px rgba(0,0,0,0.25);
}

/* 内容区域 */
.sidebar-content {
  padding: 16px;
  flex: 1;
  overflow-y: auto;
}

.info-row {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid #333;
}

.info-key {
  color: #aaa;
  font-size: 12px;
}

.info-value {
  color: #fff;
  max-width: 180px;
  word-break: break-all;
  text-align: right;
  font-size: 12px;
}

.station-info-panel {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 4px 0;
}

.station-card {
  padding: 18px;
  border-radius: 16px;
  background: radial-gradient(circle at top right, rgba(71, 108, 255, 0.25), rgba(19, 24, 39, 0.4));
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 15px 35px rgba(5, 6, 12, 0.45);
}

.station-card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.station-title {
  font-size: 24px;
  font-weight: 600;
  margin: 0;
  line-height: 1.3;
}

.station-chip {
  padding: 4px 10px;
  font-size: 12px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #9fbaff;
  border: 1px solid rgba(159, 186, 255, 0.35);
  border-radius: 999px;
  background: rgba(159, 186, 255, 0.08);
}

.station-stats {
  display: flex;
  align-items: stretch;
  gap: 18px;
  margin-top: 18px;
  padding: 14px 16px;
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.stat-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.stat-label {
  font-size: 13px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #9ab6ff;
}

.stat-value {
  font-size: 16px;
  font-weight: 600;
  color: #f5f5f5;
  word-break: break-word;
}

.stat-divider {
  width: 1px;
  background: linear-gradient(180deg, transparent, rgba(255, 255, 255, 0.45), transparent);
}

.stat-item--platform {
  align-items: center;
  text-align: center;
}

.stat-item--platform .stat-value {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.stat-item--coords {
  align-items: center;
  text-align: center;
}

.coord-lines {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: center;
}

.coord-line {
  font-size: 15px;
  font-weight: 600;
  color: #f5f5f5;
}

.railway-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.section-title {
  font-size: 13px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #9ab6ff;
}

.railway-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.railway-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  position: relative;
}


.railway-line {
  width: 4px;
  border-radius: 999px;
  background: var(--railway-color, #888);
  display: inline-block;
  align-self: stretch;
  min-height: 24px;
}

.railway-row .railway-name {
  font-size: 14px;
  color: #f5f5f5;
}

.empty-hint {
  text-align: center;
  color: #777;
  font-size: 13px;
  padding: 12px;
  border-radius: 8px;
  border: 1px dashed #444;
  background: rgba(255, 255, 255, 0.02);
}

/* 路线规划容器 */
.route-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.input-group {
  position: relative;
}

/* 交换按钮容器 */
.swap-button-container {
  display: flex;
  justify-content: center;
  align-items: center;
  margin: -8px 0;
}

.swap-btn {
  width: 40px;
  height: 40px;
  border: 2px solid #444;
  border-radius: 50%;
  background: #2c2c2c;
  color: #3a7afe;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s ease;
  position: relative;
}

.swap-btn:hover:not(:disabled) {
  background: #3a7afe;
  color: #fff;
  border-color: #3a7afe;
  transform: rotate(180deg);
  box-shadow: 0 0 12px rgba(58, 122, 254, 0.4);
}

.swap-btn:active:not(:disabled) {
  transform: rotate(180deg) scale(0.95);
}

.swap-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
  color: #666;
}

/* 交换按钮气泡提示 */
.swap-tooltip {
  position: absolute;
  left: 50%;
  top: 110%;
  transform: translateX(-50%);
  background: #222;
  color: #fff;
  padding: 6px 14px;
  border-radius: 6px;
  font-size: 13px;
  white-space: nowrap;
  box-shadow: 0 2px 8px rgba(0,0,0,0.18);
  z-index: 10;
  pointer-events: none;
  opacity: 0.95;
}

.swap-icon {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  transition: transform 0.3s ease;
}

/* 交换按钮容器 */
.swap-button-container {
  display: flex;
  justify-content: center;
  align-items: center;
  margin: -8px 0;
}

.swap-btn {
  width: 40px;
  height: 40px;
  border: 2px solid #444;
  border-radius: 50%;
  background: #2c2c2c;
  color: #3a7afe;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s ease;
  position: relative;
}

.swap-btn:hover:not(:disabled) {
  background: #3a7afe;
  color: #fff;
  border-color: #3a7afe;
  transform: rotate(180deg);
  box-shadow: 0 0 12px rgba(58, 122, 254, 0.4);
}

.swap-btn:active:not(:disabled) {
  transform: rotate(180deg) scale(0.95);
}

.swap-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
  color: #666;
}

.swap-icon {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  transition: transform 0.3s ease;
}

.input-group {
  position: relative;
}

.input-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: #aaa;
  margin-bottom: 8px;
}

.icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.route-input {
  width: 100%;
  padding: 12px 12px;
  background: #2c2c2c;
  border: 1px solid #444;
  border-radius: 6px;
  color: #fff;
  font-size: 14px;
  box-sizing: border-box;
  transition: border-color 0.2s;
}

.route-input:focus {
  outline: none;
  border-color: #3a7afe;
  box-shadow: 0 0 0 2px rgba(58, 122, 254, 0.1);
}

.route-input::placeholder {
  color: #666;
}

/* 搜索建议列表 */
.suggestions {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: #2c2c2c;
  border: 1px solid #444;
  border-top: none;
  border-radius: 0 0 6px 6px;
  max-height: 200px;
  overflow-y: auto;
  z-index: 10;
  margin-top: -1px;
}

.suggestion-item {
  padding: 10px 12px;
  cursor: pointer;
  font-size: 14px;
  transition: background 0.2s;
  border-bottom: 1px solid #333;
}

.suggestion-item:last-child {
  border-bottom: none;
}

.suggestion-item:hover {
  background: #3a7afe;
  color: #fff;
}

/* 错误提示 */
.error-hint {
  padding: 6px 8px;
  margin-top: 4px;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 4px;
  color: #ef4444;
  font-size: 12px;
}

/* 提示文字 */
.routing-hint {
  padding: 12px;
  background: rgba(58, 122, 254, 0.1);
  border: 1px solid rgba(58, 122, 254, 0.3);
  border-radius: 6px;
  color: #3a7afe;
  font-size: 13px;
  text-align: center;
}

/* 底部按钮 */
.sidebar-footer {
  padding: 16px;
  border-top: 1px solid #444;
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

/* 移动端响应式调整 */
@media (max-width: 768px) {
  .sidebar {
    width: 85vw; /* 移动端使用视口宽度的 85% */
    --peek-width: 14px;
  }

  .sidebar-header {
    padding: 14px;
    font-size: 16px;
  }

  .sidebar-content {
    padding: 12px;
  }

  .route-input, .suggestion-item {
    font-size: 13px;
  }

  .sidebar-footer {
    padding: 12px;
    gap: 6px;
  }

  .sidebar-handle {
    left: -24px;
    width: 24px;
    height: 56px;
  }
}

.route-btn {
  flex: 1;
  background: #3a7afe;
  border: none;
  border-radius: 6px;
  padding: 12px;
  cursor: pointer;
  color: white;
  font-weight: bold;
  font-size: 14px;
  transition: all 0.2s;
}

.route-btn:hover {
  background: #5a8cff;
  transform: translateY(-1px);
}

.route-btn:active {
  transform: translateY(0);
}

.submit-btn {
  flex: 2;
  background: #3a7afe;
  border: none;
  border-radius: 6px;
  padding: 12px;
  cursor: pointer;
  color: white;
  font-weight: bold;
  font-size: 14px;
  transition: all 0.2s;
}

.submit-btn:hover:not(:disabled) {
  background: #5a8cff;
  transform: translateY(-1px);
}

.submit-btn:disabled {
  background: #555;
  cursor: not-allowed;
  opacity: 0.5;
}

.cancel-btn {
  flex: 1;
  background: transparent;
  border: 1px solid #666;
  border-radius: 6px;
  padding: 12px;
  cursor: pointer;
  color: #ccc;
  font-weight: bold;
  font-size: 14px;
  transition: all 0.2s;
}

.cancel-btn:hover {
  background: rgba(255, 255, 255, 0.05);
  border-color: #888;
  color: #fff;
}

/* 滚动条美化 */
.sidebar-content::-webkit-scrollbar {
  width: 6px;
}

.sidebar-content::-webkit-scrollbar-track {
  background: transparent;
}

.sidebar-content::-webkit-scrollbar-thumb {
  background: #555;
  border-radius: 3px;
}

.sidebar-content::-webkit-scrollbar-thumb:hover {
  background: #777;
}

.suggestions::-webkit-scrollbar {
  width: 6px;
}

.suggestions::-webkit-scrollbar-thumb {
  background: #555;
  border-radius: 3px;
}

/* 路线列表 */
.routes-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.route-card {
  background: #2c2c2c;
  border: 2px solid #444;
  border-radius: 8px;
  padding: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
  overflow: hidden;
}

.route-card:hover {
  border-color: #3a7afe;
  background: #323232;
  transform: translateX(2px);
  box-shadow: 0 4px 12px rgba(58, 122, 254, 0.2);
}

.route-card-active {
  border-color: #3a7afe;
  background: rgba(58, 122, 254, 0.1);
  box-shadow: inset 0 0 0 1px rgba(58, 122, 254, 0.3), 0 4px 12px rgba(58, 122, 254, 0.25);
}

.route-card::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: linear-gradient(180deg, #3a7afe, #6a9eff);
  transform: scaleY(0);
  transform-origin: center;
  transition: transform 0.2s ease;
}

.route-card-active::before,
.route-card:hover::before {
  transform: scaleY(1);
}

.route-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  padding-bottom: 10px;
  border-bottom: 1px solid #444;
}

.route-index {
  font-weight: bold;
  color: #3a7afe;
  font-size: 13px;
}

.route-distance {
  background: rgba(58, 122, 254, 0.1);
  color: #3a7afe;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: bold;
}

.route-price {
  background: rgba(238, 162, 62, 0.1);
  color: #ffd993;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: bold;
}

/* 将距离与价格一起靠右排列 */
.route-metrics {
  display: flex;
  gap: 8px;
  margin-left: auto; /* 推到右侧 */
  align-items: center;
}

.route-stations {
  margin-bottom: 8px;
}

.station-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  font-size: 13px;
}

.start-station {
  color: #fff;
  font-weight: bold;
}

.start-station::before {
  content: '●';
  color: #4ade80;
  font-size: 16px;
}

.end-station {
  color: #fff;
  font-weight: bold;
}

.end-station::before {
  content: '●';
  color: #ef4444;
  font-size: 16px;
}

.station-path {
  padding-left: 16px;
  border-left: 2px solid #555;
  margin: 4px 0;
}

.middle-station {
  padding: 4px 0;
  padding-left: 8px;
  color: #aaa;
  font-size: 12px;
  position: relative;
}

.middle-station::before {
  content: '→';
  position: absolute;
  left: -10px;
  color: #666;
}

.collapse-hint {
  padding: 4px 6px;
  margin-top: 2px;
  color: #3a7afe;
  font-size: 12px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  transition: all 0.2s;
  position: relative;
  border-radius: 4px;
  background: rgba(58, 122, 254, 0.05);
  width: fit-content;
}

.collapse-hint:hover {
  color: #5a8cff;
  background: rgba(58, 122, 254, 0.15);
}

.expand-icon {
  width: 12px;
  height: 12px;
  flex-shrink: 0;
  transition: transform 0.2s;
}

.route-info {
  display: flex;
  gap: 12px;
  align-items: center;
  padding-top: 8px;
  border-top: 1px solid #444;
}

.info-item {
  display: flex;
  align-items: center;
  gap: 4px;
  color: #999;
  font-size: 12px;
}

.mini-icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.no-routes {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 200px;
  color: #666;
  text-align: center;
}

.no-routes p {
  font-size: 14px;
}

.back-btn {
  flex: 1;
  background: transparent;
  border: 1px solid #666;
  border-radius: 6px;
  padding: 12px;
  cursor: pointer;
  color: #ccc;
  font-weight: bold;
  font-size: 14px;
  transition: all 0.2s;
}

.back-btn:hover {
  background: rgba(255, 255, 255, 0.05);
  border-color: #888;
  color: #fff;
}
</style>