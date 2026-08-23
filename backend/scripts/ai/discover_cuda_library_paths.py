import json
import os
from importlib.metadata import distribution
from pathlib import Path


CUDA_DISTRIBUTIONS = (
    "nvidia-cublas-cu12",
    "nvidia-cudnn-cu12",
    "nvidia-cuda-runtime-cu12",
    "nvidia-cuda-nvrtc-cu12",
)


def is_runtime_library(filename):
    name = Path(filename).name.lower()
    if os.name == "nt":
        return name.endswith(".dll")
    return ".so" in name


def discover_cuda_library_paths():
    directories = []
    seen = set()
    for package_name in CUDA_DISTRIBUTIONS:
        package = distribution(package_name)
        for relative_path in package.files or ():
            if not is_runtime_library(relative_path):
                continue
            directory = str(Path(package.locate_file(relative_path)).resolve().parent)
            if directory in seen:
                continue
            seen.add(directory)
            directories.append(directory)
    if not directories:
        raise RuntimeError("Aucune bibliothèque CUDA du venv n'a été trouvée.")
    return directories


if __name__ == "__main__":
    print(json.dumps(discover_cuda_library_paths()))
