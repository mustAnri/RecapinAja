/**
 * AdvancedMap — reusable interactive Leaflet map (shadcn-style `ui` primitive).
 *
 * Features:
 *  - Click-to-select (single declarative marker — no marker accumulation)
 *  - In-map place search (rate-limited Nominatim via services/geocoder)
 *  - "Locate me" (browser geolocation)
 *  - OSM / satellite base-layer toggle
 *  - Optional marker clustering (react-leaflet-cluster v4, React 19 + react-leaflet v5)
 *  - Vector overlays: polygons, circles, polylines
 *
 * Notes:
 *  - Overlays (search + controls) are React elements positioned above the map,
 *    not Leaflet DOM controls, so they stay consistent with the Tailwind design kit.
 *  - The "traffic" layer from the reference component had no tile source, so it is
 *    intentionally omitted rather than rendered as a dead control.
 */

import { useCallback, useEffect, useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Circle,
  Polygon,
  Polyline,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import L from 'leaflet';
import type { LatLngTuple, PathOptions } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'react-leaflet-cluster/dist/assets/MarkerCluster.css';
import 'react-leaflet-cluster/dist/assets/MarkerCluster.Default.css';
import { forwardGeocode } from '../../services/geocoder/nominatim';

/* ------------------------------------------------------------------ */
/* Default marker icon fix (Leaflet + bundlers)                       */
/* ------------------------------------------------------------------ */

// Clear the cached icon-url resolver so mergeOptions below takes effect.
// Assigning `undefined` (vs `delete`) keeps TypeScript strict mode happy.
(L.Icon.Default.prototype as unknown as { _getIconUrl?: string })._getIconUrl = undefined;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface MapCoordinates {
  lat: number;
  lng: number;
}

export type MarkerColor =
  | 'blue'
  | 'red'
  | 'green'
  | 'orange'
  | 'violet'
  | 'grey'
  | 'black'
  | 'gold'
  | 'yellow';

export type MarkerSize = 'small' | 'medium' | 'large';

export interface MapMarkerPopup {
  title?: string;
  content?: string;
  image?: string;
}

export interface MapMarker {
  id?: string | number;
  position: LatLngTuple;
  color?: MarkerColor;
  size?: MarkerSize;
  icon?: L.Icon | L.DivIcon;
  popup?: MapMarkerPopup;
}

export interface MapPolygon {
  id?: string | number;
  positions: LatLngTuple[];
  style?: PathOptions;
  popup?: string;
}

export interface MapCircle {
  id?: string | number;
  center: LatLngTuple;
  radius: number; // meters
  style?: PathOptions;
  popup?: string;
}

export interface MapPolyline {
  id?: string | number;
  positions: LatLngTuple[];
  style?: PathOptions;
  popup?: string;
}

export interface MapSearchResult {
  latLng: LatLngTuple;
  name: string;
}

export interface AdvancedMapProps {
  /** Map center. Defaults to Jakarta. */
  center?: LatLngTuple;
  /** Initial zoom level. */
  zoom?: number;
  /** When provided, the map animates to this coordinate whenever it changes. */
  focus?: LatLngTuple;
  /** Point markers (clustered when enableClustering is true). */
  markers?: MapMarker[];
  polygons?: MapPolygon[];
  circles?: MapCircle[];
  polylines?: MapPolyline[];
  onMarkerClick?: (marker: MapMarker) => void;
  /** Fired with lat/lng when the user clicks the map. */
  onMapClick?: (coords: MapCoordinates) => void;
  /** Fired when the in-map search resolves a place. */
  onSearchResult?: (result: MapSearchResult) => void;
  enableClustering?: boolean;
  enableSearch?: boolean;
  enableControls?: boolean;
  /** Base layer toggle state is managed internally. */
  className?: string;
  style?: CSSProperties;
  /** Disables interaction (zoom, click, overlays). */
  disabled?: boolean;
}

/* ------------------------------------------------------------------ */
/* Marker icon factory                                                 */
/* ------------------------------------------------------------------ */

const MARKER_SIZES: Record<MarkerSize, [number, number]> = {
  small: [20, 32],
  medium: [25, 41],
  large: [30, 50],
};

function createCustomIcon(color: MarkerColor = 'blue', size: MarkerSize = 'medium'): L.Icon {
  const [w, h] = MARKER_SIZES[size];
  return new L.Icon({
    iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-${color}.png`,
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
    iconSize: [w, h],
    iconAnchor: [w / 2, h],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
  });
}

/* ------------------------------------------------------------------ */
/* Internal map helper components                                      */
/* ------------------------------------------------------------------ */

interface FlyTarget extends MapCoordinates {
  zoom?: number;
}

function MapEvents({ onMapClick }: { onMapClick?: (coords: MapCoordinates) => void }) {
  useMapEvents({
    click(e) {
      onMapClick?.({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

function FlyToController({ target }: { target: FlyTarget | null }) {
  const map = useMap();
  useEffect(() => {
    if (!target) return;
    map.flyTo([target.lat, target.lng], target.zoom ?? map.getZoom(), { duration: 0.8 });
  }, [target, map]);
  return null;
}

function FocusController({ focus }: { focus?: LatLngTuple }) {
  const map = useMap();
  useEffect(() => {
    if (!focus) return;
    map.flyTo(focus, map.getZoom(), { duration: 0.6 });
  }, [focus, map]);
  return null;
}

/* ------------------------------------------------------------------ */
/* Main component                                                      */
/* ------------------------------------------------------------------ */

export function AdvancedMap({
  center = [-6.2, 106.816666],
  zoom = 11,
  focus,
  markers = [],
  polygons = [],
  circles = [],
  polylines = [],
  onMarkerClick,
  onMapClick,
  onSearchResult,
  enableClustering = true,
  enableSearch = true,
  enableControls = true,
  className = '',
  style = { height: '420px', width: '100%' },
  disabled = false,
}: AdvancedMapProps) {
  const [baseLayer, setBaseLayer] = useState<'osm' | 'satellite'>('osm');
  const [userLocation, setUserLocation] = useState<MapCoordinates | null>(null);
  const [searchResult, setSearchResult] = useState<MapSearchResult | null>(null);
  const [clickedLocation, setClickedLocation] = useState<MapCoordinates | null>(null);
  const [flyTarget, setFlyTarget] = useState<FlyTarget | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const handleMapClick = useCallback(
    (coords: MapCoordinates) => {
      if (disabled) return;
      setClickedLocation(coords);
      onMapClick?.(coords);
    },
    [disabled, onMapClick],
  );

  const handleLocate = useCallback(() => {
    if (!navigator.geolocation) {
      setSearchError('Geolocation tidak didukung browser ini');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords = { lat: position.coords.latitude, lng: position.coords.longitude };
        setUserLocation(coords);
        setFlyTarget({ ...coords, zoom: 15 });
      },
      () => setSearchError('Tidak dapat mengakses lokasi Anda'),
    );
  }, []);

  const toggleBaseLayer = useCallback(() => {
    setBaseLayer((prev) => (prev === 'osm' ? 'satellite' : 'osm'));
  }, []);

  const handleSearchSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      const query = searchQuery.trim();
      if (!query || isSearching || disabled) return;

      setIsSearching(true);
      setSearchError(null);
      try {
        // countrycodes '' lifts the default Indonesia restriction for global map search.
        const result = await forwardGeocode(query, { limit: 1, countrycodes: '' });
        const latLng: LatLngTuple = [parseFloat(result.lat), parseFloat(result.lon)];
        const found: MapSearchResult = { latLng, name: result.display_name };
        setSearchResult(found);
        setFlyTarget({ lat: latLng[0], lng: latLng[1], zoom: 14 });
        onSearchResult?.(found);
      } catch (error) {
        setSearchError(error instanceof Error ? error.message : 'Pencarian lokasi gagal');
      } finally {
        setIsSearching(false);
      }
    },
    [searchQuery, isSearching, disabled, onSearchResult],
  );

  const markerElements = markers.map((marker, index) => (
    <Marker
      key={marker.id ?? index}
      position={marker.position}
      icon={marker.icon ?? createCustomIcon(marker.color ?? 'blue', marker.size ?? 'medium')}
      eventHandlers={onMarkerClick ? { click: () => onMarkerClick(marker) } : undefined}
    >
      {marker.popup && (
        <Popup>
          <div>
            {marker.popup.title && <h3 className="text-sm font-semibold">{marker.popup.title}</h3>}
            {marker.popup.content && <p className="text-xs">{marker.popup.content}</p>}
            {marker.popup.image && (
              <img
                src={marker.popup.image}
                alt={marker.popup.title ?? 'marker'}
                className="mt-1 max-w-[200px]"
              />
            )}
          </div>
        </Popup>
      )}
    </Marker>
  ));

  return (
    <div
      className={`relative overflow-hidden rounded-xl border border-slate-300 bg-slate-100 ${className}`}
      style={style}
    >
      <MapContainer
        center={center}
        zoom={zoom}
        scrollWheelZoom={!disabled}
        style={{ height: '100%', width: '100%' }}
        className="z-0"
      >
        {baseLayer === 'osm' ? (
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
        ) : (
          <TileLayer
            attribution="Tiles &copy; Esri"
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          />
        )}

        <MapEvents onMapClick={handleMapClick} />
        <FlyToController target={flyTarget} />
        <FocusController focus={focus} />

        {enableClustering && markers.length > 0 ? (
          <MarkerClusterGroup chunkedLoading>{markerElements}</MarkerClusterGroup>
        ) : (
          markerElements
        )}

        {userLocation && (
          <Marker position={[userLocation.lat, userLocation.lng]} icon={createCustomIcon('red', 'medium')}>
            <Popup>Lokasi Anda saat ini</Popup>
          </Marker>
        )}

        {searchResult && (
          <Marker position={searchResult.latLng} icon={createCustomIcon('green', 'large')}>
            <Popup>{searchResult.name}</Popup>
          </Marker>
        )}

        {clickedLocation && (
          <Marker
            position={[clickedLocation.lat, clickedLocation.lng]}
            icon={createCustomIcon('orange', 'small')}
          >
            <Popup>
              Lat: {clickedLocation.lat.toFixed(6)}
              <br />
              Lng: {clickedLocation.lng.toFixed(6)}
            </Popup>
          </Marker>
        )}

        {polygons.map((polygon, index) => (
          <Polygon
            key={polygon.id ?? index}
            positions={polygon.positions}
            pathOptions={polygon.style ?? { color: 'purple', weight: 2, fillOpacity: 0.3 }}
          >
            {polygon.popup && <Popup>{polygon.popup}</Popup>}
          </Polygon>
        ))}

        {circles.map((circle, index) => (
          <Circle
            key={circle.id ?? index}
            center={circle.center}
            radius={circle.radius}
            pathOptions={circle.style ?? { color: 'blue', weight: 2, fillOpacity: 0.2 }}
          >
            {circle.popup && <Popup>{circle.popup}</Popup>}
          </Circle>
        ))}

        {polylines.map((polyline, index) => (
          <Polyline
            key={polyline.id ?? index}
            positions={polyline.positions}
            pathOptions={polyline.style ?? { color: 'red', weight: 3 }}
          >
            {polyline.popup && <Popup>{polyline.popup}</Popup>}
          </Polyline>
        ))}
      </MapContainer>

      {/* In-map search overlay */}
      {enableSearch && !disabled && (
        <form
          onSubmit={handleSearchSubmit}
          className="absolute left-3 top-3 z-[1000] flex w-64 max-w-[70%] gap-1.5"
        >
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari lokasi..."
            className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 shadow-md focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
          <button
            type="submit"
            disabled={isSearching || !searchQuery.trim()}
            className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white shadow-md transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Cari lokasi"
          >
            {isSearching ? '…' : '🔍'}
          </button>
        </form>
      )}

      {/* Search feedback */}
      {searchError && !disabled && (
        <div className="absolute left-3 top-14 z-[1000] max-w-[70%] rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 shadow-md">
          {searchError}
        </div>
      )}

      {/* Locate / layer controls overlay */}
      {enableControls && !disabled && (
        <div className="absolute right-3 top-3 z-[1000] flex flex-col gap-1.5">
          <button
            type="button"
            onClick={handleLocate}
            title="Lokasi saya"
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm shadow-md transition hover:bg-slate-50"
          >
            📍
          </button>
          <button
            type="button"
            onClick={toggleBaseLayer}
            title={baseLayer === 'osm' ? 'Tampilkan satelit' : 'Tampilkan peta'}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm shadow-md transition hover:bg-slate-50"
          >
            🛰️
          </button>
        </div>
      )}

      {/* Hint when nothing selected yet */}
      {!clickedLocation && !searchResult && !disabled && (
        <div className="pointer-events-none absolute bottom-3 left-1/2 z-[1000] -translate-x-1/2 rounded-lg bg-white/90 px-3 py-1.5 text-xs text-slate-600 shadow-md backdrop-blur-sm">
          💡 Klik peta atau cari untuk memilih lokasi
        </div>
      )}
    </div>
  );
}
