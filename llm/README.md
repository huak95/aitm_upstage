# AITM-LLM

This project is an advanced modular AI application designed to facilitate personalized meeting summaries and feedback. The system integrates multiple components, including ASR (Automatic Speech Recognition), hierarchical vector databases, clustering techniques, and various AI-driven modules to create a comprehensive and adaptable solution.

## Setup

Here's a description of the provided commands:

---

This set of commands is used to set up and run a Python-based API for an AI or machine learning project. The steps include creating a virtual environment, installing necessary dependencies, and launching the API server.

### Step-by-Step Breakdown:

1. **Create a Conda Environment:**

    ```bash
    conda create -n aitm_llm python=3.10 -y
    ```

    - **`conda create -n aitm_llm`**: This command creates a new Conda environment named `aitm_llm`.
    - **`python=3.10`**: Specifies that the environment should use Python version 3.10.
    - **`-y`**: Automatically confirms the creation of the environment without prompting the user.

2. **Activate the Conda Environment:**

    ```bash
    conda activate aitm_llm
    ```

    - **`conda activate aitm_llm`**: This command activates the newly created Conda environment, making it the current working environment. This ensures that all installed packages and dependencies are isolated within this environment.

3. **Install Required Dependencies:**

    ```bash
    pip install -r requirements.txt
    ```

    - **`pip install -r requirements.txt`**: This command installs all the Python packages listed in the `requirements.txt` file. This file typically contains a list of libraries and their versions required to run the project.

4. **Run the API Server:**

    ```bash
    fastapi dev app.py
    ```

    - **`fastapi dev app.py`**: This command starts the FastAPI server in development mode. It runs the `app.py` file, which likely contains the main application code for the API. The FastAPI server will then be accessible, allowing you to interact with the API endpoints defined in the `app.py` file.

---

These commands set up an isolated Python environment tailored to the project's requirements, ensuring that all necessary dependencies are installed and allowing the API to be run in a controlled and reproducible manner.