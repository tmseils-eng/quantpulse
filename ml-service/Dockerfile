# Runs the optional ML signal service (see README.md's "Machine learning
# signal" section). Separate image from the main Node app on purpose — this
# is the one part of QuantPulse with a Python dependency.
FROM python:3.11-slim

WORKDIR /app
COPY ml-service/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY ml-service/ ./

# Where a trained model is read from/written to — a volume gets mounted here
# in docker-compose so a model trained via `docker compose exec ml-service
# python train.py ...` survives container restarts, same pattern as the main
# app's /data SQLite volume.
RUN mkdir -p /data
ENV ML_MODEL_PATH=/data/model.joblib
ENV PORT=8000
EXPOSE 8000

CMD ["python", "app.py"]
