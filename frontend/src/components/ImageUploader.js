import React, { useRef, useState } from "react";

const ImageUploader = ({ setImage }) => {
  const [preview, setPreview] = useState(null);
  const fileInputRef = useRef();

  const handleImageChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      setImage(file);
      setPreview(URL.createObjectURL(file));
    }
  };

  const handleDrop = (event) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file) {
      setImage(file);
      setPreview(URL.createObjectURL(file));
    }
  };

  return (
    <div
      className="flex flex-col items-center mx-auto cursor-pointer"
      style={{ width: "200px", height: "300px" }}
      onClick={() => fileInputRef.current.click()}
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
    >
      <div
        className="border border-dashed border-neutral-400 dark:border-neutral-200 rounded-lg shadow-xl flex items-center justify-center overflow-hidden"
        style={{ width: "200px", height: "300px" }}
      >
        {preview ? (
          <img src={preview} alt="Prévisualisation" className="h-full w-full object-cover" />
        ) : (
          <p className="text-center text-neutral-600">Glissez ou cliquez pour ajouter une image</p>
        )}
      </div>
      <input
        type="file"
        accept="image/*"
        ref={fileInputRef}
        className="hidden"
        onChange={handleImageChange}
      />
    </div>
  );
};

export default ImageUploader;
