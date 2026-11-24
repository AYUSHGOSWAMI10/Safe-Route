
import { useEffect, useMemo } from "react";
import {
  MapContainer,
  TileLayer,
  Polyline,
  CircleMarker,
  Popup,
  useMap,
} from "react-leaflet";

import "leaflet/dist/leaflet.css";

// Convert supported coordinate formats into [latitude, longitude].
function normalizeCoordinate(point) {
  if (Array.isArray(point) && point.length >= 2) {
    return [Number(point[0]), Number(point[1])];
  }

  if (point && typeof point === "object") {
    const lat = Number(point.lat);
    const lng = Number(point.lng ?? point.lon);

    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return [lat, lng];
    }
  }

  return null;
}

// Automatically adjust the map to show the complete route.
function FitRoute({ positions }) {
  const map = useMap();

  useEffect(() => {
    if (positions.length > 0) {
      if (positions.length === 1) {
        map.setView(positions[0], 15);
      } else {
        map.fitBounds(positions, { padding: [40, 40] });
      }
    }
  }, [map, positions]);

  return null;
}

export default function RouteMap({
  route,
  sourceCoordinate,
  destinationCoordinate,
  routeCoordinates,
}) {
  const positions = useMemo(() => {
    // Prefer explicitly supplied route coordinates.
    if (Array.isArray(routeCoordinates)) {
      return routeCoordinates
        .map(normalizeCoordinate)
        .filter(Boolean);
    }

    // Support GeoJSON LineString coordinates: [longitude, latitude].
    if (
      route?.geometry?.type === "LineString" &&
      Array.isArray(route.geometry.coordinates)
    ) {
      return route.geometry.coordinates
        .map(([lng, lat]) => [Number(lat), Number(lng)])
        .filter(([lat, lng]) =>
          Number.isFinite(lat) && Number.isFinite(lng)
        );
    }

    // Support route.coordinates as [lat, lng] or {lat, lng}.
    if (Array.isArray(route?.coordinates)) {
      return route.coordinates
        .map(normalizeCoordinate)
        .filter(Boolean);
    }

    // Support path entries that already contain coordinates.
    if (Array.isArray(route?.path)) {
      return route.path
        .map(normalizeCoordinate)
        .filter(Boolean);
    }

    return [];
  }, [route, routeCoordinates]);

  const start = normalizeCoordinate(sourceCoordinate) ||
    positions[0] ||
    null;

  const end = normalizeCoordinate(destinationCoordinate) ||
    positions[positions.length - 1] ||
    null;

  // Do not invent a route if coordinates are unavailable.
  const hasRoute = positions.length >= 2;
  const hasMarkers = Boolean(start && end);

  if (!hasMarkers) {
    return (
      <section className="map-section">
        <div className="map-heading">
          <h2>Route map</h2>
          <span>Map preview</span>
        </div>

        <div className="map-placeholder">
          <h3>Route coordinates unavailable</h3>
          <p>
            The selected route currently contains location names
            or node IDs, but not latitude and longitude.
          </p>
          <p>
            Coordinates from the backend are required to display
            the actual route on the map.
          </p>
        </div>
      </section>
    );
  }

  const center = start;

  return (
    <section className="map-section">
      <div className="map-heading">
        <div>
          <h2>Route map</h2>
          <p>
            {route?.name || "Selected route"}
          </p>
        </div>

        <span>OpenStreetMap</span>
      </div>

      <div className="route-map-container">
        <MapContainer
          center={center}
          zoom={14}
          scrollWheelZoom={true}
          className="route-map"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <FitRoute
            positions={hasRoute ? positions : [start, end]}
          />

          {hasRoute && (
            <Polyline
              positions={positions}
              pathOptions={{
                color: "#16845e",
                weight: 5,
                opacity: 0.85,
              }}
            />
          )}

          <CircleMarker
            center={start}
            radius={9}
            pathOptions={{
              color: "#ffffff",
              fillColor: "#16845e",
              fillOpacity: 1,
              weight: 3,
            }}
          >
            <Popup>Starting point</Popup>
          </CircleMarker>

          <CircleMarker
            center={end}
            radius={9}
            pathOptions={{
              color: "#ffffff",
              fillColor: "#dc5555",
              fillOpacity: 1,
              weight: 3,
            }}
          >
            <Popup>Destination</Popup>
          </CircleMarker>
        </MapContainer>
      </div>

      {!hasRoute && (
        <p className="map-note">
          Only the start and destination are available.
          Actual route geometry has not been provided.
        </p>
      )}

      <div className="map-legend">
        <span>
          <i className="start-dot" /> Starting point
        </span>

        <span>
          <i className="end-dot" /> Destination
        </span>

        {hasRoute && (
          <span>
            <i className="route-line" /> Selected route
          </span>
        )}
      </div>
    </section>
  );
}
