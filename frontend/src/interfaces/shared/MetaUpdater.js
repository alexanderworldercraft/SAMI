import React from "react";
import { useLocation } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { buildRouteSeo } from "../../seo/routePolicy.mjs";

export default function MetaUpdater() {
  const { pathname } = useLocation();
  const meta = buildRouteSeo({
    pathname,
    siteName: process.env.REACT_APP_NAME || "SAMI",
    origin: window.location.origin,
  });
  return (
    <Helmet>
      <title>{meta.title}</title>
      <meta name="description" content={meta.description} />
      <meta name="application-name" content={meta.siteName} />
      <meta name="robots" content={meta.robots} />
      {meta.canonicalUrl && <link rel="canonical" href={meta.canonicalUrl} />}
      <meta property="og:type" content={meta.type} />
      <meta property="og:locale" content="fr_FR" />
      <meta property="og:site_name" content={meta.siteName} />
      <meta property="og:title" content={meta.title} />
      <meta property="og:description" content={meta.description} />
      {meta.canonicalUrl && <meta property="og:url" content={meta.canonicalUrl} />}
      <meta property="og:image" content={meta.imageUrl} />
      <meta property="og:image:alt" content={meta.imageAlt} />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={meta.title} />
      <meta name="twitter:description" content={meta.description} />
      <meta name="twitter:image" content={meta.imageUrl} />
      <meta name="twitter:image:alt" content={meta.imageAlt} />
    </Helmet>
  );
}

