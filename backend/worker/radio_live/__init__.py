"""Bhim Radio's rolling bulletin: rebuilt whenever the news changes, newest story first.

    python -m backend.worker.radio_live            # what the Batch job runs
    python -m backend.worker.radio_live --force    # rebuild even if nothing changed
    python -m backend.worker.radio_live --local OUT  # build into OUT, upload nothing

The format is the one agreed for "दैनिक मध्य भारत समाचार": the "9 point +
biased" scripts at about a minute a story, read by Ishita as anchor काजल जाटव,
headlines and a closing recap over the theme, the four produced ads every
twelve minutes. See build.py for the order of the bulletin and publish.py for
what goes to S3.
"""
