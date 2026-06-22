{"findings":[{"line":20,"summary":"The loop checks each running task but never calls task.cancel, so children keep running after cancellation."}]}
