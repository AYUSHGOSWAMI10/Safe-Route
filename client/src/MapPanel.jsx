
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMapEvents } from "react-leaflet";
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

function MapClickHandler({ source, destination, onSourceSelect, onDestinationSelect }) {
  useMapEvents({
    click(event) {
      const point = {
        lat: event.latlng.lat,
        lng: event.latlng.lng,
      };

      if (!source) {
        onSourceSelect(point);
      } else if (!destination) {
        onDestinationSelect(point);
      } else {
        onSourceSelect(point);
        onDestinationSelect(null);
      }
    },
  });

  return null;
}

export default function MapPanel({
  source,
  destination,
  onSourceSelect,
  onDestinationSelect,
}) {
  const routeLine =
    source && destination
      ? [
          [source.lat, source.lng],
          [destination.lat, destination.lng],
        ]
      : [];

  return (
    <div className="map-panel">
      <div className="map-heading">
        <div>
          <h3>Route Map</h3>
          <p>Click on the map to select your locations</p>
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

        <MapClickHandler
          source={source}
          destination={destination}
          onSourceSelect={onSourceSelect}
          onDestinationSelect={onDestinationSelect}
        />

        {source && (
          <Marker position={[source.lat, source.lng]} icon={sourceIcon}>
            <Popup>Starting location</Popup>
          </Marker>
        )}

        {destination && (
          <Marker
            position={[destination.lat, destination.lng]}
            icon={destinationIcon}
          >
            <Popup>Destination</Popup>
          </Marker>
        )}

        {routeLine.length > 0 && (
          <Polyline positions={routeLine} pathOptions={{ color: "#2563eb", weight: 5 }} />
        )}
      </MapContainer>

      <div className="map-instructions">
        <span><b className="source-dot" /> Source</span>
        <span><b className="destination-dot" /> Destination</span>
        <span>Illustrative straight line, not a calculated route</span>
      </div>
    </div>
  );
}
