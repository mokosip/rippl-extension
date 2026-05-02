import "fake-indexeddb/auto";

type StorageData = Record<string, unknown>;
const storageStore: StorageData = {};

const mockStorage = {
  local: {
    get: vi.fn((keys: string | string[] | null) => {
      if (keys === null) return Promise.resolve({ ...storageStore });
      const keyList = Array.isArray(keys) ? keys : [keys];
      const result: StorageData = {};
      for (const key of keyList) {
        if (key in storageStore) result[key] = storageStore[key];
      }
      return Promise.resolve(result);
    }),
    set: vi.fn((items: StorageData) => {
      Object.assign(storageStore, items);
      return Promise.resolve();
    }),
    remove: vi.fn((keys: string | string[]) => {
      const keyList = Array.isArray(keys) ? keys : [keys];
      for (const key of keyList) delete storageStore[key];
      return Promise.resolve();
    }),
    clear: vi.fn(() => {
      for (const key of Object.keys(storageStore)) delete storageStore[key];
      return Promise.resolve();
    }),
  },
};

const alarmListeners: Array<(alarm: chrome.alarms.Alarm) => void> = [];

const mockAlarms = {
  create: vi.fn((_name: string, _info: chrome.alarms.AlarmCreateInfo) => Promise.resolve()),
  clear: vi.fn((_name: string) => Promise.resolve(true)),
  onAlarm: {
    addListener: vi.fn((cb: (alarm: chrome.alarms.Alarm) => void) => {
      alarmListeners.push(cb);
    }),
    removeListener: vi.fn(),
    hasListener: vi.fn(() => false),
  },
};

const mockIdle = {
  queryState: vi.fn(() => Promise.resolve("active" as chrome.idle.IdleState)),
  onStateChanged: {
    addListener: vi.fn(),
    removeListener: vi.fn(),
    hasListener: vi.fn(() => false),
  },
  setDetectionInterval: vi.fn(),
};

const tabListeners: Array<(activeInfo: { tabId: number; windowId: number }) => void> = [];
const tabUpdateListeners: Array<(tabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) => void> = [];

const mockTabs = {
  get: vi.fn((_tabId: number) => Promise.resolve({ id: _tabId, url: "" } as chrome.tabs.Tab)),
  query: vi.fn(() => Promise.resolve([])),
  create: vi.fn(() => Promise.resolve({} as chrome.tabs.Tab)),
  onActivated: {
    addListener: vi.fn((cb: (info: { tabId: number; windowId: number }) => void) => {
      tabListeners.push(cb);
    }),
    removeListener: vi.fn(),
    hasListener: vi.fn(() => false),
  },
  onUpdated: {
    addListener: vi.fn((cb: (tabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) => void) => {
      tabUpdateListeners.push(cb);
    }),
    removeListener: vi.fn(),
    hasListener: vi.fn(() => false),
  },
  onRemoved: {
    addListener: vi.fn(),
    removeListener: vi.fn(),
    hasListener: vi.fn(() => false),
  },
};

const mockAction = {
  setBadgeText: vi.fn(() => Promise.resolve()),
  setBadgeBackgroundColor: vi.fn(() => Promise.resolve()),
  setIcon: vi.fn(() => Promise.resolve()),
};

const mockRuntime = {
  onInstalled: {
    addListener: vi.fn(),
    removeListener: vi.fn(),
    hasListener: vi.fn(() => false),
  },
  getURL: vi.fn((path: string) => `chrome-extension://fake-id/${path}`),
};

const mockNotifications = {
  create: vi.fn((_id: string, _opts: unknown) => Promise.resolve()),
  clear: vi.fn(() => Promise.resolve(true)),
  onClicked: {
    addListener: vi.fn(),
    removeListener: vi.fn(),
    hasListener: vi.fn(() => false),
  },
};

const mockPermissions = {
  request: vi.fn(() => Promise.resolve(true)),
  contains: vi.fn(() => Promise.resolve(false)),
};

(globalThis as Record<string, unknown>).chrome = {
  storage: mockStorage,
  alarms: mockAlarms,
  idle: mockIdle,
  tabs: mockTabs,
  action: mockAction,
  runtime: mockRuntime,
  notifications: mockNotifications,
  permissions: mockPermissions,
};

export function clearMockStorage() {
  for (const key of Object.keys(storageStore)) delete storageStore[key];
  mockStorage.local.get.mockClear();
  mockStorage.local.set.mockClear();
  mockStorage.local.remove.mockClear();
}

export function setMockStorage(data: StorageData) {
  Object.assign(storageStore, data);
}

export { tabListeners, tabUpdateListeners, alarmListeners };
