import { useEffect } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./MapPanel.css";

const sourceIcon = L.divIcon({
  className: "map-marker",
  html: '<div class="source-pin">S</div>',
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

const destinationIcon = L.divIcon({
  className: "map-marker",
  html: '<div class="destination-pin">D</div>',
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

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

function MapClickHandler({
  source,
  destination,
  onSourceSelect,
  onDestinationSelect,
  onReselectOrigin,
}) {
  useMapEvents({
    click(event) {
      const point = {
        lat: event.latlng.lat,
        lng: event.latlng.lng,
      };

      if (!source) {
        onSourceSelect(point);
      } else if (!destination) {
        // Once the start is set, the next click sets the destination.
        onDestinationSelect(point);
      } else {
        // Both origin and destination are already set. Start a fresh
        // selection from the clicked point instead of silently
        // overwriting the destination.
        onReselectOrigin(point);
      }
    },
  });

  return null;
}

function MapViewport({ source, destination, routeCoordinates }) {
  const map = useMap();

  useEffect(() => {
    const points = [];

    if (Array.isArray(routeCoordinates)) {
      routeCoordinates
        .map(normalizeCoordinate)
        .filter(Boolean)
        .forEach((point) => points.push(point));
    }

    [source, destination]
      .filter(Boolean)
      .forEach((point) => points.push([point.lat, point.lng]));

    if (points.length === 0) {
      return;
    }

    if (points.length === 1) {
      map.setView(points[0], 15);
      return;
    }

    const bounds = L.latLngBounds(points);

    if (bounds.getNorthEast().equals(bounds.getSouthWest())) {
      map.setView(points[0], 15);
    } else {
      map.fitBounds(bounds, {
        padding: [36, 36],
        maxZoom: 15,
      });
    }
  }, [
    map,
    source?.lat,
    source?.lng,
    destination?.lat,
    destination?.lng,
    routeCoordinates,
  ]);

  return null;
}

export default function MapPanel({
  source,
  destination,
  onSourceSelect,
  onDestinationSelect,
  onReselectOrigin,
  routeCoordinates,
}) {

  // Prefer the calculated route geometry.
  // When the backend provides no walking-route geometry, do NOT invent
  // a straight-line source-to-destination polyline. Keep routeLine empty
  // so the Polyline is hidden and an appropriate no-route state is shown
  // in the parent App component.
  const hasCalculatedRoute =
    Array.isArray(routeCoordinates) && routeCoordinates.length >= 2;

  // Only draw the route polyline when the backend actually returned geometry.
  // Falling back to a straight line is treated as "no calculated route."
  const routeLine = hasCalculatedRoute
    ? routeCoordinates.map(normalizeCoordinate).filter(Boolean)
    : [];

  const start = source ? [source.lat, source.lng] : null;
  const end = destination ? [destination.lat, destination.lng] : null;

  // Do not show markers unless both coordinates are available.
  const hasMarkers = Boolean(start && end);

  return (
    <div className="map-panel">
      <div className="map-heading">
        <div>
          <h3>Route Map</h3>
          <p>
            {!source
              ? "Click once to set your starting point."
              : !destination
              ? "Click to set or update your destination."
              : hasCalculatedRoute
              ? "Calculated route displayed on the map."
              : "Origin and destination selected."}
          </p>
        </div>
        <span className="map-live">● Map available</span>
      </div>

      <MapContainer
        center={[27.58, 77.70]}
        zoom={13}
        scrollWheelZoom={true}
        className="safe-map"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <MapViewport
          source={source}
          destination={destination}
          routeCoordinates={routeCoordinates}
        />

        <MapClickHandler
          source={source}
          destination={destination}
          onSourceSelect={onSourceSelect}
          onDestinationSelect={onDestinationSelect}
          onReselectOrigin={onReselectOrigin}
        />

        {start && (
          <Marker position={[start[0], start[1]]} icon={sourceIcon}>
            <Popup>Starting location</Popup>
          </Marker>
        )}

        {end && (
          <Marker position={[end[0], end[1]]} icon={destinationIcon}>
            <Popup>Destination</Popup>
          </Marker>
        )}

        {routeLine.length > 0 && (
          <Polyline
            positions={routeLine}
            pathOptions={{
              color: hasCalculatedRoute ? "#16845e" : "#2563eb",
              weight: 5,
              opacity: 0.85,
            }}
          />
        )}
      </MapContainer>

      <div className="map-instructions">
        <span><b className="source-dot" /> Source</span>
        <span><b className="destination-dot" /> Destination</span>
        {hasCalculatedRoute ? (
          <span>Calculated route geometry (from backend)</span>
        ) : (
          <span>Illustrative straight line, not a calculated route</span>
        )}
      </div>
    </div>
  );
}
