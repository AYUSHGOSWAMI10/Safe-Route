export default function RouteCard({ route, recommended }) {
  return (
    <article className={`route-card${recommended ? " recommended" : ""}`}>
      <div className="route-heading">
        <h3>{route.name}</h3>
        {recommended && <span className="badge">Recommended</span>}
      </div>
      <div className="route-stats">
        <div><span>Travel time</span><strong>{route.estimatedTime} min</strong></div>
        <div><span>Distance</span><strong>{route.distance} km</strong></div>
        <div><span>Safety score</span><strong>{route.safetyScore}/100</strong></div>
      </div>
      <p className="route-path">{route.path.join(" → ")}</p>
    </article>
  );
}
