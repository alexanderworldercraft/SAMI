import React, { useState, useEffect, useRef } from "react";

const ImagePreview = ({ onImageSelect, initialImage = null }) => {
  const [imagePreview, setImagePreview] = useState(initialImage); // Garde une trace de l'image actuelle
  const [isImageSelected, setIsImageSelected] = useState(false); // Vérifie si une nouvelle image a été sélectionnée
  const inputRef = useRef();

  useEffect(() => {
    // Met à jour uniquement si une image initiale est fournie ET aucune image n'est sélectionnée
    if (initialImage && !isImageSelected) {
      setImagePreview(initialImage);
    }
  }, [initialImage, isImageSelected]);

  const handleImageUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      setImagePreview(URL.createObjectURL(file)); // Prévisualisation de l'image
      setIsImageSelected(true); // Indique qu'une nouvelle image a été sélectionnée
      onImageSelect(file); // Envoie l'image au parent
    }
  };

  const handleDrop = (event) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file) {
      setImagePreview(URL.createObjectURL(file));
      setIsImageSelected(true); // Indique qu'une nouvelle image a été sélectionnée
      onImageSelect(file);
    }
  };

  const handleDragOver = (event) => {
    event.preventDefault();
    event.currentTarget.classList.add("border-blue-500");
  };

  const handleDragLeave = (event) => {
    event.currentTarget.classList.remove("border-blue-500");
  };

  const triggerFileInput = () => {
    inputRef.current.click(); // Simule un clic sur le champ d'entrée
  };

  return (
    <div className="max-w-md mx-auto">
      <div
        className="flex flex-col items-center cursor-pointer drop-shadow-xl mx-auto"
        style={{ width: "200px", height: "200px" }}
        onClick={triggerFileInput}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <div
          className="border border-dashed border-sky-500 rounded-lg flex items-center justify-center overflow-hidden"
          style={{ width: "200px", height: "200px" }}
        >
          {imagePreview ? (
            <img
              src={imagePreview}
              alt="Preview"
              className="h-full w-full object-cover"
            />
          ) : (
            <svg
              className="mx-auto h-12 w-12 text-gray-300"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M1.5 6a2.25 2.25 0 0 1 2.25-2.25h16.5A2.25 2.25 0 0 1 22.5 6v12a2.25 2.25 0 0 1-2.25 2.25H3.75A2.25 2.25 0 0 1 1.5 18V6ZM3 16.06V18c0 .414.336.75.75.75h16.5A.75.75 0 0 0 21 18v-1.94l-2.69-2.689a1.5 1.5 0 0 0-2.12 0l-.88.879.97.97a.75.75 0 1 1-1.06 1.06l-5.16-5.159a1.5 1.5 0 0 0-2.12 0L3 16.061Zm10.125-7.81a1.125 1.125 0 1 1 2.25 0 1.125 1.125 0 0 1-2.25 0Z"
                clipRule="evenodd"
              />
            </svg>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleImageUpload}
        />
      </div>
    </div>
  );
};

export default ImagePreview;