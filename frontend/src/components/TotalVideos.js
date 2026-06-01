import React, { useEffect, useState } from "react";

const apiUrl = process.env.REACT_APP_URL_LOCAL || "https://192.168.0.17:1234";

const TotalVideos = () => {
  const [total, setTotal] = useState(0);
  const [totalFilms, setTotalFilms] = useState(0);
  const [totalSeries, setTotalSeries] = useState(0);

  useEffect(() => {
    const fetchTotalVideos = async () => {
      try {
        const response = await fetch(`${apiUrl}/api/videos/total`);
        const data = await response.json();
        //console.log("Total Videos:", data); // Log pour vérifier les données
        if (response.ok) {
          setTotal(data.total);
        } else {
          console.error("Erreur lors de la récupération du nombre de vidéos :", data.error);
        }
      } catch (error) {
        console.error("Erreur lors de la requête API :", error);
      }
    };

    const fetchTotalFilms = async () => {
      try {
        const response = await fetch(`${apiUrl}/api/videos/totalfilms`);
        const data = await response.json();
        //console.log("Total Films:", data); // Log pour vérifier les données
        if (response.ok) {
          setTotalFilms(data.totalFilms);
        } else {
          console.error("Erreur lors de la récupération du nombre de vidéos :", data.error);
        }
      } catch (error) {
        console.error("Erreur lors de la requête API :", error);
      }
    };

    const fetchTotalSeries = async () => {
      try {
        const response = await fetch(`${apiUrl}/api/videos/totalseries`);
        const data = await response.json();
        //console.log("Total Series:", data); // Log pour vérifier les données
        if (response.ok) {
          setTotalSeries(data.totalSeries);
        } else {
          console.error("Erreur lors de la récupération du nombre de vidéos :", data.error);
        }
      } catch (error) {
        console.error("Erreur lors de la requête API :", error);
      }
    };

    // Appels des trois fonctions en parallèle
    const fetchData = async () => {
      await Promise.all([fetchTotalVideos(), fetchTotalFilms(), fetchTotalSeries()]);
    };

    fetchData();
  }, []);

  return (
    <div className="text-center grid grid-cols-1 md:grid-cols-3 gap-4">
      <div>
        <h3 className="text-lg font-bold">Total de vidéos <span className="italic">{total}</span></h3>
      </div>
      <div>
        <h3 className="text-lg font-bold">Films <span className="italic">{totalFilms}</span></h3>
      </div>
      <div>
        <h3 className="text-lg font-bold">Séries <span className="italic">{totalSeries}</span></h3>
      </div>
    </div>
  );
};

export default TotalVideos;
