web: python manage.py migrate --noinput && python manage.py collectstatic --noinput && gunicorn config.wsgi --bind 0.0.0.0:$PORT --timeout 600 --workers 2 --threads 4
worker: celery -A config worker -l info --concurrency 2
beat: celery -A config beat -l info
